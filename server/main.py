from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import threading
import zipfile
from pathlib import Path
from typing import Optional
from xml.etree import ElementTree

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps

try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass

MAX_BYTES = 25 * 1024 * 1024
IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
    ".heic",
    ".heif",
}
AUDIVERIS_IMAGE = os.environ.get("AUDIVERIS_DOCKER_IMAGE", "toprock/audiveris:stable")
AUDIVERIS_BIN = os.environ.get("AUDIVERIS_BIN", "").strip()
OMR_LOCK = threading.Lock()
WORK_ROOT = Path(
    os.environ.get(
        "OMR_WORK_DIR",
        str(Path(__file__).resolve().parent.parent / ".omr-work"),
    )
)
WORK_ROOT.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Sightreading Rhythm Assistant OMR")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_origin_regex=r"http://[^/]+:(5173|4173)",
)


def docker_available() -> bool:
    try:
        result = subprocess.run(
            ["docker", "info", "--format", "{{.ServerVersion}}"],
            capture_output=True,
            text=True,
            timeout=6,
        )
        return result.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def docker_hint() -> str:
    return (
        "Docker is not responding. Start Docker Desktop (or run `colima start`), "
        "then try the photo again."
    )


def find_musicxml(output_dir: Path) -> Optional[Path]:
    candidates = sorted(
        output_dir.rglob("*"),
        key=lambda path: path.stat().st_mtime if path.is_file() else 0,
        reverse=True,
    )
    for extension in (".mxl", ".musicxml", ".xml"):
        for path in candidates:
            if path.is_file() and path.suffix.lower() == extension:
                return path
    return None


def read_musicxml(path: Path) -> str:
    if path.suffix.lower() == ".mxl":
        with zipfile.ZipFile(path) as archive:
            score_path = None
            if "META-INF/container.xml" in archive.namelist():
                container = ElementTree.fromstring(
                    archive.read("META-INF/container.xml")
                )
                for element in container.iter():
                    if element.tag.endswith("rootfile"):
                        score_path = element.attrib.get("full-path")
                        break
            if score_path and score_path in archive.namelist():
                return archive.read(score_path).decode("utf-8-sig", "replace")
            for name in archive.namelist():
                if name.lower().endswith((".xml", ".musicxml")) and not name.startswith(
                    "META-INF/"
                ):
                    return archive.read(name).decode("utf-8-sig", "replace")
        raise ValueError("The generated .mxl file did not contain a MusicXML score.")
    return path.read_text(encoding="utf-8-sig", errors="replace")


def musicxml_title(xml: str, fallback: str) -> str:
    try:
        root = ElementTree.fromstring(xml.encode("utf-8"))
    except ElementTree.ParseError:
        return fallback
    for tag in ("work-title", "movement-title", "title"):
        for element in root.iter():
            if element.tag.endswith(tag) and element.text and element.text.strip():
                return element.text.strip()
    return fallback


def write_pdf(source: Path, destination: Path) -> None:
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        longest = max(image.size)
        if longest > 2600:
            scale = 2600 / longest
            image = image.resize(
                (max(1, int(image.width * scale)), max(1, int(image.height * scale))),
                Image.LANCZOS,
            )
        image.save(destination, "PDF", resolution=300.0)


def run_omr(input_pdf: Path, output_dir: Path) -> str:
    if AUDIVERIS_BIN:
        command = [
            AUDIVERIS_BIN,
            "-batch",
            "-export",
            "-output",
            str(output_dir),
            str(input_pdf),
        ]
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=600,
            )
        except FileNotFoundError as error:
            raise HTTPException(
                status_code=503,
                detail=f"Audiveris executable not found at {AUDIVERIS_BIN}.",
            ) from error
        except subprocess.TimeoutExpired as error:
            raise HTTPException(
                status_code=504,
                detail="Audiveris took too long to read this page. Try a clearer, tighter photo.",
            ) from error
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()[-900:]
            raise HTTPException(
                status_code=502,
                detail=f"Audiveris could not read this page. {detail}",
            )
    else:
        if not docker_available():
            raise HTTPException(status_code=503, detail=docker_hint())

        input_dir = input_pdf.parent
        command = [
            "docker",
            "run",
            "--rm",
            "-v",
            f"{input_dir}:/input",
            "-v",
            f"{output_dir}:/output",
            AUDIVERIS_IMAGE,
        ]
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=600,
            )
        except subprocess.TimeoutExpired as error:
            raise HTTPException(
                status_code=504,
                detail="Audiveris took too long to read this page. Try a clearer, tighter photo.",
            ) from error
        except OSError as error:
            raise HTTPException(status_code=503, detail=docker_hint()) from error
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()[-900:]
            raise HTTPException(
                status_code=502,
                detail=f"Audiveris could not read this page. {detail}",
            )

    musicxml_path = find_musicxml(output_dir)
    if not musicxml_path:
        raise HTTPException(
            status_code=422,
            detail=(
                "Audiveris did not find recognisable music on this page. "
                "Try a straight, well-lit photo with the whole page in frame."
            ),
        )
    return read_musicxml(musicxml_path)


@app.get("/api/health")
def health() -> dict:
    has_binary = bool(AUDIVERIS_BIN)
    has_docker = docker_available()
    return {
        "ready": has_binary or has_docker,
        "audiverisBinary": AUDIVERIS_BIN or None,
        "docker": has_docker,
        "dockerImage": AUDIVERIS_IMAGE,
        "hint": None if (has_binary or has_docker) else docker_hint(),
    }


@app.post("/api/omr")
def omr(file: UploadFile = File(...)) -> dict:
    if not OMR_LOCK.acquire(blocking=False):
        raise HTTPException(
            status_code=429,
            detail="Another page is still being read. Wait for it to finish, then try again.",
        )
    workdir: Optional[Path] = None
    try:
        WORK_ROOT.mkdir(parents=True, exist_ok=True)
        workdir = Path(
            tempfile.mkdtemp(prefix="sightreading-omr-", dir=str(WORK_ROOT))
        )
        input_dir = workdir / "input"
        output_dir = workdir / "output"
        input_dir.mkdir()
        output_dir.mkdir()

        filename = Path(file.filename or "upload")
        extension = filename.suffix.lower()
        if extension not in IMAGE_EXTENSIONS and extension != ".pdf":
            raise HTTPException(
                status_code=400,
                detail="Upload a JPG, PNG, HEIC, WebP, TIFF or PDF photo of sheet music.",
            )

        upload_path = input_dir / f"upload{extension if extension else '.bin'}"
        size = 0
        with upload_path.open("wb") as handle:
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail="That file is larger than 25 MB. Try a smaller photo.",
                    )
                handle.write(chunk)
        if size == 0:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")

        if extension == ".pdf":
            pdf_path = input_dir / "sheet.pdf"
            shutil.move(str(upload_path), pdf_path)
        else:
            pdf_path = input_dir / "sheet.pdf"
            try:
                write_pdf(upload_path, pdf_path)
            except Exception as error:  # Pillow raises several image error types
                raise HTTPException(
                    status_code=400,
                    detail=f"Could not read that image. {error}",
                ) from error
            finally:
                upload_path.unlink(missing_ok=True)

        xml = run_omr(pdf_path, output_dir)
        title = musicxml_title(xml, filename.stem or "Scanned piece")
        return {"musicxml": xml, "title": title}
    finally:
        if workdir is not None:
            shutil.rmtree(workdir, ignore_errors=True)
        OMR_LOCK.release()


@app.exception_handler(Exception)
async def unhandled_error(_request, error: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={
            "detail": (
                "The OMR server hit an unexpected error. Check the server log. "
                f"({type(error).__name__}: {error})"
            )
        },
    )


DIST_DIR = Path(__file__).resolve().parent.parent / "dist"
if DIST_DIR.is_dir():
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="web")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)
