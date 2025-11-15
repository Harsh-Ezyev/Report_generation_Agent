import pandas as pd
from sqlalchemy import create_engine

# ========== DATABASE CONFIG ==========
DB_HOST = "i0xwrv7gwd.t7uc1w0ave.tsdb.cloud.timescale.com:31750"
DB_NAME = "tsdb"
DB_USER = "tsdbadmin"
DB_PASS = "ezyevTrabante"
TABLE_NAME = "iot.bms_telemetry"

# =====================================

def load_soc_data(hours=720):
    """Fetch SOC + timestamp for last X hours (default 30 days)."""
    engine_url = f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{DB_HOST}/{DB_NAME}?sslmode=require"
    engine = create_engine(engine_url)

    query = f"""
        SELECT ts, battery_id, battery_soc_pct
        FROM {TABLE_NAME}
        WHERE ts >= NOW() - INTERVAL '{hours} hours'
        AND battery_id IS NOT NULL
        ORDER BY battery_id, ts ASC;
    """

    df = pd.read_sql(query, engine)
    df["ts"] = pd.to_datetime(df["ts"], utc=True)
    return df


def calculate_cycles(df):
    """Calculate Equivalent Full Cycles using SOC drops."""
    df = df.sort_values("ts")
    df["prev_soc"] = df["battery_soc_pct"].shift(1)
    df["drop"] = (df["prev_soc"] - df["battery_soc_pct"]).clip(lower=0)
    return df["drop"].sum() / 100


def compute_all_cycles(df):
    """Compute cycles for each battery across multiple time windows."""
    results = []

    unique_batteries = df["battery_id"].unique()

    for battery in unique_batteries:
        bdf = df[df["battery_id"] == battery]

        # 24 hours cycles
        df_24h = bdf[bdf["ts"] >= (bdf["ts"].max() - pd.Timedelta(hours=24))]
        cycles_24h = calculate_cycles(df_24h) if len(df_24h) > 1 else 0

        # 7 days cycles
        df_7d = bdf[bdf["ts"] >= (bdf["ts"].max() - pd.Timedelta(days=7))]
        cycles_7d = calculate_cycles(df_7d) if len(df_7d) > 1 else 0

        # 30 days cycles
        df_30d = bdf[bdf["ts"] >= (bdf["ts"].max() - pd.Timedelta(days=30))]
        cycles_30d = calculate_cycles(df_30d) if len(df_30d) > 1 else 0

        # Total cycles
        total_cycles = calculate_cycles(bdf)

        results.append({
            "battery_id": battery,
            "cycles_last_24h": round(cycles_24h, 3),
            "cycles_last_7d": round(cycles_7d, 3),
            "cycles_last_30d": round(cycles_30d, 3),
            "total_cycles": round(total_cycles, 3),
        })

    return pd.DataFrame(results)


def main():
    print("🔄 Fetching SOC data...")
    df = load_soc_data()

    print("⚡ Computing cycle counts...")
    cycle_df = compute_all_cycles(df)

    output_file = "battery_cycle_counts.csv"
    cycle_df.to_csv(output_file, index=False)

    print(f"✅ Cycle calculation complete! Saved to {output_file}")
    print(cycle_df)


if __name__ == "__main__":
    main()