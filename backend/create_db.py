"""Create the rag_eval_db database if it doesn't exist.
Reads connection details from config.json."""

import json
from pathlib import Path

import psycopg2

cfg_path = Path(__file__).parent / "config.json"
with open(cfg_path, encoding="utf-8") as f:
    cfg = json.load(f)

db = cfg.get("database", {})
host = db.get("host", "localhost")
port = db.get("port", 5432)
db_name = db.get("name", "rag_eval_db")
user = db.get("user", "postgres")
password = db.get("password", "postgres")

try:
    conn = psycopg2.connect(
        dbname="postgres",
        user=user,
        password=password,
        host=host,
        port=port,
    )
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
    if cur.fetchone():
        print(f"Database '{db_name}' already exists.")
    else:
        cur.execute(f'CREATE DATABASE "{db_name}"')
        print(f"Database '{db_name}' created successfully.")

    cur.close()
    conn.close()
except Exception as e:
    print(f"Error connecting to PostgreSQL: {e}")
    print(f"\nConnection details (from config.json):")
    print(f"  Host:     {host}")
    print(f"  Port:     {port}")
    print(f"  User:     {user}")
    print(f"  Password: {'*' * len(password)}")
    print(f"  Database: {db_name}")
    print(f"\nFix the password in backend/config.json -> database.password")
    print(f"Or create the database manually: CREATE DATABASE {db_name};")
