FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir --upgrade pip
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt
COPY app /app/app
COPY bootstrap.sql /app/bootstrap.sql
EXPOSE 8000
ENV PGHOST=postgres PGPORT=5432 PGDATABASE=honoua PGUSER=honou PGPASSWORD=Honou2035Lg!
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
