import os
from dotenv import load_dotenv
import psycopg

load_dotenv()
url = os.environ["DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://")

with psycopg.connect(url) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT version();")
        print(cur.fetchone()[0])
