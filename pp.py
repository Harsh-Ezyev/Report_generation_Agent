#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import re
import time
import base64
import requests
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from sqlalchemy import create_engine
from fpdf import FPDF
from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
import unicodedata

# ==============================
# Load environment variables
# ==============================
load_dotenv()

DB_HOST = os.getenv("DB_HOST")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
TABLE_NAME = os.getenv("TABLE_NAME")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
EMAIL_FROM_ADDRESS = os.getenv("EMAIL_FROM_ADDRESS")
EMAIL_RECIPIENTS = os.getenv("EMAIL_RECIPIENTS")
GMAIL_CLIENT_ID = os.getenv("GMAIL_CLIENT_ID")
GMAIL_CLIENT_SECRET = os.getenv("GMAIL_CLIENT_SECRET")
GMAIL_REFRESH_TOKEN = os.getenv("GMAIL_REFRESH_TOKEN")


# ==============================
# PDF Sanitizer (PREVENTS CRASH)
# ==============================
def sanitize_for_pdf(text):
    """Ensure PDF receives ASCII-only text."""
    if text is None:
        return ""

    # Replace problematic dashes
    text = text.replace("–", "-").replace("—", "-")

    # Replace smart quotes
    text = text.replace("“", '"').replace("”", '"')
    text = text.replace("‘", "'").replace("’", "'")

    # Remove emojis / unsupported symbols
    text = re.sub(r"[^\x00-\x7F]", "", text)

    # Normalize
    text = unicodedata.normalize("NFKD", text)

    # Latin-1 encode (FPDF safe)
    return text.encode("latin-1", "ignore").decode("latin-1", "ignore")


# ==============================
# Custom PDF Class
# ==============================
class PDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 14)
        self.cell(0, 10, sanitize_for_pdf("AI Agent Battery Performance Report (2-Hour Aggregated)"), 0, 1, "C")
        self.ln(4)

    def chapter_title(self, title):
        self.set_font("Helvetica", "BU", 12)
        self.cell(0, 10, sanitize_for_pdf(title), 0, 1)
        self.ln(2)

    def chapter_body(self, text):
        self.set_font("Helvetica", "", 11)
        self.multi_cell(0, 8, sanitize_for_pdf(text))
        self.ln(2)


# ==============================
# DB Helpers
# ==============================
def get_engine():
    try:
        url = f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{DB_HOST}/{DB_NAME}?sslmode=require"
        return create_engine(url)
    except Exception as e:
        sys.exit(f"DB Engine Error: {e}")


def to_ist(ts):
    ts = pd.to_datetime(ts, errors="coerce")
    if ts.dt.tz is None:
        return ts.dt.tz_localize("UTC").dt.tz_convert("Asia/Kolkata")
    return ts.dt.tz_convert("Asia/Kolkata")


# ==============================
# Load Aggregated 2H Data
# ==============================
def load_2h_data():
    print("--- Fetching 2-hour aggregated data ---")
    try:
        engine = get_engine()
        sql = f"""
        SELECT
            time_bucket('2 hours', ts) AS ts,
            battery_id,
            MAX(odo_meter_km) AS odo,
            AVG(battery_soc_pct) AS soc
        FROM {TABLE_NAME}
        WHERE ts >= NOW() - INTERVAL '24 hours'
        GROUP BY 1, battery_id
        ORDER BY battery_id, 1;
        """
        df = pd.read_sql_query(sql, engine)
        df["ts"] = to_ist(df["ts"])
        print(f"2-hour aggregated rows: {len(df)} (IST)")
        return df
    except Exception as e:
        sys.exit(f"2H Data Load Error: {e}")


# ==============================
# Load First/Last Rows (RAW)
# ==============================
def load_first_last():
    print("--- Fetching RAW first/last rows ---")
    try:
        engine = get_engine()

        sql_first = f"""
        SELECT DISTINCT ON (battery_id)
        battery_id, ts, battery_soc_pct, odo_meter_km
        FROM {TABLE_NAME}
        WHERE ts >= NOW() - INTERVAL '24 hours'
        ORDER BY battery_id, ts ASC;
        """

        sql_last = f"""
        SELECT DISTINCT ON (battery_id)
        battery_id, ts, battery_soc_pct, odo_meter_km
        FROM {TABLE_NAME}
        WHERE ts >= NOW() - INTERVAL '24 hours'
        ORDER BY battery_id, ts DESC;
        """

        df_first = pd.read_sql_query(sql_first, engine)
        df_last = pd.read_sql_query(sql_last, engine)

        df_first["ts"] = to_ist(df_first["ts"])
        df_last["ts"] = to_ist(df_last["ts"])

        merged = pd.merge(df_first, df_last, on="battery_id", suffixes=("_first", "_last"))
        print(f"Loaded first/last rows: {len(merged)} batteries")

        return merged
    except Exception as e:
        sys.exit(f"RAW First/Last Load Error: {e}")


# ==============================
# Hybrid Anomaly Detection
# ==============================
def detect_anomalies(df):
    df = df.sort_values(["battery_id", "ts"]).copy()
    df["soc_drop"] = df.groupby("battery_id")["soc"].diff()

    anomalies = []

    for b, g in df.groupby("battery_id"):
        drops = g["soc_drop"].dropna()
        if len(drops) == 0:
            anomalies.append((b, g, pd.DataFrame()))
            continue

        mean_d = drops.mean()
        std_d = drops.std()
        threshold = mean_d - 1.5 * std_d

        g_anom = g[(g["soc_drop"] < -15) | (g["soc_drop"] < threshold)]
        anomalies.append((b, g, g_anom))

    return anomalies


# ==============================
# Groq Summarizer (with retries)
# ==============================
def call_groq_summary(text, purpose="summary"):
    if not GROQ_API_KEY:
        return "[Summary unavailable – missing API key]"

    # token reduction
    lines = text.split("\n")
    if len(lines) > 10:
        lines = lines[:10]
    text = "\n".join(lines)

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}

    payload = {
        "model": "moonshotai/kimi-k2-instruct-0905",
        "messages": [
            {
                "role": "system",
                "content": (
                    "Produce a short 2–3 line summary. "
                    "Do NOT reveal chain of thought. "
                    "Do NOT use <think>. Only final answer."
                ),
            },
            {
                "role": "user",
                "content": f"Summarize this {purpose}:\n{text}",
            },
        ],
        "temperature": 0.2,
        "max_tokens": 100,
    }

    for attempt in range(5):
        try:
            r = requests.post(url, headers=headers, json=payload, timeout=20)
            data = r.json()

            if "error" in data:
                code = data["error"].get("code")
                if code == "rate_limit_exceeded":
                    wait = 1 + attempt * 1.5
                    print(f"Groq rate limit → retrying in {wait:.1f}s")
                    time.sleep(wait)
                    continue

            if "choices" in data:
                out = data["choices"][0]["message"]["content"]
                out = re.sub(r"<think>.*?</think>", "", out, flags=re.DOTALL).strip()
                return sanitize_for_pdf(out)

            print("Groq unknown error:", data)
            return "[Summary unavailable]"

        except Exception as e:
            print(f"Groq exception: {e} (retrying...)")
            time.sleep(1 + attempt)

    return "[Summary unavailable]"


# ==============================
# Email Sender
# ==============================
def send_email(pdf_path):
    creds = Credentials(
        None,
        refresh_token=GMAIL_REFRESH_TOKEN,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GMAIL_CLIENT_ID,
        client_secret=GMAIL_CLIENT_SECRET,
    )

    service = build("gmail", "v1", credentials=creds)

    msg = MIMEMultipart()
    msg["To"] = EMAIL_RECIPIENTS
    msg["From"] = EMAIL_FROM_ADDRESS
    msg["Subject"] = "Daily Battery Performance Report"

    msg.attach(MIMEText("Attached is the latest battery performance report.", "plain"))

    with open(pdf_path, "rb") as f:
        part = MIMEApplication(f.read(), _subtype="pdf")
        part.add_header("Content-Disposition", "attachment", filename="Battery_Report.pdf")
        msg.attach(part)

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    service.users().messages().send(userId="me", body={"raw": raw}).execute()
    print("Email sent successfully!")


# ==============================
# Main
# ==============================
def main():
    pdf = PDF()
    pdf.set_auto_page_break(auto=True, margin=15)

    # Load data
    df_2h = load_2h_data()
    df_raw = load_first_last()

    # Fleet summary
    df_raw["soc_delta"] = df_raw["battery_soc_pct_last"] - df_raw["battery_soc_pct_first"]
    df_raw["odo_delta"] = df_raw["odo_meter_km_last"] - df_raw["odo_meter_km_first"]

    total = len(df_raw)
    avg_soc = df_raw["soc_delta"].mean()
    worst_soc = df_raw["soc_delta"].min()
    zero_odo = df_raw[df_raw["odo_delta"] == 0]["battery_id"].tolist()

    # Summary page
    pdf.add_page()
    pdf.chapter_title("Fleet Summary (Last 24 Hours)")
    pdf.chapter_body(
        f"Total Batteries Analysed: {total}\n"
        f"Average SOC Change: {avg_soc:.2f}%\n"
        f"Worst SOC Drop: {worst_soc:.2f}%\n"
        f"Batteries With No ODO Movement: {len(zero_odo)}"
    )

    fleet_summary_data = df_raw[["battery_id", "soc_delta", "odo_delta"]].to_string()
    fleet_summary_llm = call_groq_summary(fleet_summary_data, "fleet summary")
    pdf.chapter_body("LLM Summary:\n" + fleet_summary_llm)

    # Anomalies
    anomalies = detect_anomalies(df_2h)
    anomalies_sorted = [a for a in anomalies if not a[2].empty] + [a for a in anomalies if a[2].empty]

    # Per battery pages
    for battery_id, batt_data, batt_anom in anomalies_sorted:
        pdf.add_page()
        pdf.chapter_title(f"Battery: {battery_id}")

        row = df_raw[df_raw["battery_id"] == battery_id].iloc[0]
        pdf.chapter_body(
            f"ODO Change (24h): {row['odo_delta']:.2f} km\n"
            f"SOC Change (24h): {row['soc_delta']:.2f}%"
        )

        pdf.chapter_title("Anomalies")
        if not batt_anom.empty:
            for _, r in batt_anom.iterrows():
                pdf.chapter_body(f"{r['ts']} → SOC drop {r['soc_drop']:.2f}%")

            summary_text = batt_anom[["ts", "soc_drop"]].to_string()
            llm_out = call_groq_summary(summary_text, f"battery {battery_id} anomalies")
            pdf.chapter_body("LLM Summary:\n" + llm_out)
        else:
            pdf.chapter_body("No anomalies detected.")

        # Plot graphs
        try:
            fig, ax = plt.subplots(2, 1, figsize=(8, 6))

            ax[0].plot(batt_data["ts"], batt_data["odo"], color="gold", linewidth=2)
            ax[0].set_title("Odometer (2H Aggregated)")
            ax[0].yaxis.set_label_text("km")

            ax[1].plot(batt_data["ts"], batt_data["soc"], color="green", linewidth=2)
            ax[1].set_title("SOC (2H Aggregated)")
            ax[1].yaxis.set_label_text("%")

            fmt = mdates.DateFormatter("%H:%M")
            for a in ax:
                a.xaxis.set_major_formatter(fmt)
                a.xaxis.set_major_locator(mdates.HourLocator(interval=2))
                a.tick_params(axis="x", rotation=45)

            plt.tight_layout()
            fname = f"plot_{battery_id}.png"
            plt.savefig(fname)
            plt.close()
            pdf.image(fname, x=10, w=180)
            os.remove(fname)

        except Exception as e:
            pdf.chapter_body(f"Plot Error: {str(e)}")

    # Save PDF
    out = "Battery_Report.pdf"
    pdf.output(out)
    print("Report generated successfully:", out)

    send_email(out)


if __name__ == "__main__":
    main()