import sys
import os
import re
import glob
import subprocess

def main():
    if len(sys.argv) < 3:
        print("Uso: python render_pdf.py <input.html> <output.pdf>", file=sys.stderr)
        sys.exit(1)

    input_html_path = sys.argv[1]
    output_pdf_path = sys.argv[2]

    try:
        with open(input_html_path, 'r', encoding='utf-8') as f:
            html_content = f.read()

        # 1. Sanitizar scripts e iframes
        html_content = re.sub(r'<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>', '', html_content, flags=re.IGNORECASE)
        html_content = re.sub(r'<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>', '', html_content, flags=re.IGNORECASE)

        # 2. Injetar estilos de impressão diretamente no HTML
        custom_style = """
        <style>
            @page { size: A4; margin: 0; }
            .no-print, .fab-container { display: none !important; }
            body { 
                background-color: white !important; 
                margin: 0 !important; 
                padding: 0 !important; 
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            #zoom-wrapper { 
                padding: 0 !important; 
                margin: 0 !important; 
                transform: none !important; 
                display: block !important; 
            }
            .page-container { 
                margin: 0 auto !important; 
                box-shadow: none !important; 
                border: none !important; 
                padding: 25px 60px 25px 60px !important; 
                width: 100% !important; 
                max-width: 100% !important; 
                box-sizing: border-box !important; 
            }
            .header { margin-bottom: 15px !important; padding-bottom: 12px !important; }
            .highlights-container { margin-bottom: 15px !important; padding: 12px !important; }
            .info-section { margin-bottom: 15px !important; }
            .lance-box { margin-bottom: 15px !important; padding: 12px !important; }
            .plan-info-box { margin-bottom: 15px !important; padding: 12px !important; }
            .section-header { margin-bottom: 10px !important; padding-bottom: 6px !important; }
            .info-row { margin-bottom: 6px !important; }
            table { margin-top: 10px !important; margin-bottom: 10px !important; }
            th, td { padding: 6px 8px !important; }
            .footer { margin-top: 15px !important; padding-top: 10px !important; }
        </style>
        """
        if "</head>" in html_content:
            html_content = html_content.replace("</head>", f"{custom_style}</head>")
        else:
            html_content = f"{custom_style}{html_content}"

        processed_html_path = input_html_path + ".processed.html"
        with open(processed_html_path, 'w', encoding='utf-8') as f:
            f.write(html_content)

        # 3. Localizar binário nativo do Chromium para renderização C++ ultrarrápida (200ms)
        candidates = (
            glob.glob("/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell") +
            glob.glob("/ms-playwright/chromium-*/chrome-linux/chrome") +
            glob.glob("/root/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell") +
            glob.glob("/root/.cache/ms-playwright/chromium-*/chrome-linux/chrome") +
            glob.glob("/home/*/.cache/ms-playwright/chromium-*/chrome-linux/chrome") +
            ["/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium"]
        )

        chrome_bin = None
        for cand in candidates:
            if os.path.exists(cand) and os.access(cand, os.X_OK):
                chrome_bin = cand
                break

        if chrome_bin:
            print(f"[render_pdf] Utilizando Chromium nativo em: {chrome_bin}", file=sys.stderr, flush=True)
            cmd = [
                chrome_bin,
                "--headless",
                "--disable-gpu",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--no-pdf-header-footer",
                f"--print-to-pdf={output_pdf_path}",
                f"file://{processed_html_path}"
            ]
            run_res = subprocess.run(cmd, capture_output=True, text=True, timeout=12)
            if os.path.exists(output_pdf_path) and os.path.getsize(output_pdf_path) > 100:
                print(f"[render_pdf] PDF gerado via Chromium CLI com sucesso ({os.path.getsize(output_pdf_path)} bytes)", flush=True)
                if os.path.exists(processed_html_path):
                    os.remove(processed_html_path)
                sys.exit(0)
            else:
                print(f"[render_pdf] Chromium CLI falhou: {run_res.stderr}. Tentando fallback Playwright...", file=sys.stderr, flush=True)

        # 4. Fallback Playwright caso Chromium CLI não esteja disponível
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(args=[
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run'
            ])
            try:
                page = browser.new_page(
                    viewport={'width': 794, 'height': 1123},
                    java_script_enabled=False
                )
                page.set_content(html_content, wait_until='domcontentloaded', timeout=10000)
                page.emulate_media(media="screen")
                page.pdf(
                    path=output_pdf_path,
                    format='A4',
                    print_background=True,
                    margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
                    scale=0.95
                )
            finally:
                browser.close()

        if os.path.exists(processed_html_path):
            os.remove(processed_html_path)

        print("OK", flush=True)
        sys.exit(0)

    except Exception as e:
        print(f"Erro no render_pdf: {e}", file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == '__main__':
    main()
