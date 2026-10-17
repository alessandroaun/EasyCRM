# Imagem oficial do Playwright atualizada para a versão 1.63.0 exigida pelo sistema
FROM mcr.microsoft.com/playwright/python:v1.63.0-jammy

# Instala as fontes para evitar erros de renderização no PDF
RUN apt-get update && apt-get install -y \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PYTHONUNBUFFERED=1

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install --with-deps chromium

COPY . .

EXPOSE 8080

CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "8", "--timeout", "0", "app:app"]