import hmac
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

app = FastAPI(docs_url=None, redoc_url=None)
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
CONVERSION_TIMEOUT_SECONDS = 90


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/convert")
async def convert_docx(
    document: UploadFile = File(...),
    authorization: str | None = Header(default=None),
):
    expected_token = os.environ.get("PDF_CONVERTER_TOKEN", "")
    if not expected_token:
        raise HTTPException(status_code=503, detail="PDF converter is not configured")

    supplied_token = authorization.removeprefix("Bearer ") if authorization else ""
    if not hmac.compare_digest(supplied_token, expected_token):
        raise HTTPException(status_code=401, detail="Unauthorized")

    original_name = Path(document.filename or "document.docx").name
    if not original_name.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only DOCX files can be converted")

    payload = await document.read(MAX_UPLOAD_BYTES + 1)
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="DOCX exceeds the 25 MB limit")
    if not payload.startswith(b"PK"):
        raise HTTPException(status_code=400, detail="Invalid DOCX file")

    work_dir = tempfile.mkdtemp(prefix="docx-pdf-")
    input_path = os.path.join(work_dir, "document.docx")
    output_path = os.path.join(work_dir, "document.pdf")
    with open(input_path, "wb") as input_file:
        input_file.write(payload)

    try:
        result = subprocess.run(
            [
                "libreoffice",
                f"-env:UserInstallation={Path(work_dir, 'lo-profile').as_uri()}",
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                work_dir,
                input_path,
            ],
            capture_output=True,
            text=True,
            timeout=CONVERSION_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(status_code=504, detail="DOCX to PDF conversion timed out") from error

    if result.returncode != 0 or not os.path.isfile(output_path):
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(status_code=422, detail="LibreOffice could not convert this DOCX")

    with open(output_path, "rb") as pdf_file:
        if not pdf_file.read(5).startswith(b"%PDF-"):
            shutil.rmtree(work_dir, ignore_errors=True)
            raise HTTPException(status_code=422, detail="LibreOffice returned an invalid PDF")

    base_name = re.sub(r"[^A-Za-z0-9_-]+", "_", Path(original_name).stem).strip("_") or "document"
    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=f"{base_name}.pdf",
        background=BackgroundTask(shutil.rmtree, work_dir, ignore_errors=True),
    )