import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://clause:clause@localhost:5432/clause")
WORKER_SHARED_SECRET = os.environ["WORKER_SHARED_SECRET"]
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "gpt-4o-mini")
MAX_CONCURRENCY = int(os.getenv("MAX_CONCURRENCY", "4"))
STORAGE_BUCKET = os.getenv("STORAGE_BUCKET", "contracts")
STORAGE_ENDPOINT = os.getenv("STORAGE_ENDPOINT", "http://localhost:9000")
STORAGE_ACCESS_KEY = os.getenv("STORAGE_ACCESS_KEY", "clause")
STORAGE_SECRET_KEY = os.getenv("STORAGE_SECRET_KEY", "clause-secret")
STORAGE_REGION = os.getenv("STORAGE_REGION", "us-east-1")
STORAGE_LOCAL_PATH = os.getenv("STORAGE_LOCAL_PATH", "")
STORAGE_DRIVER = os.getenv("STORAGE_DRIVER", "s3")  # s3 | fs
