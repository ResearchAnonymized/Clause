FROM python:3.12-slim

# unstructured needs poppler + libmagic + tesseract for PDF/OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils libmagic1 tesseract-ocr libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY worker ./worker
ENV PORT=8787
EXPOSE 8787
CMD ["sh", "-c", "uvicorn worker.main:app --host 0.0.0.0 --port ${PORT}"]
