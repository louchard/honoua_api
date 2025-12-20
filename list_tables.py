import sqlite3

conn = sqlite3.connect('honoua.db')
c = conn.cursor()

print("\n=== Liste des tables de honoua.db ===\n")
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = c.fetchall()
for t in tables:
    print(t)

conn.close()
