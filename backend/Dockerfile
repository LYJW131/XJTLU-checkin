FROM python:3.14-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

COPY backend/ .

EXPOSE 8000

CMD ["uvicorn", "backend_api_server:app", "--host", "0.0.0.0", "--port", "8000"]
