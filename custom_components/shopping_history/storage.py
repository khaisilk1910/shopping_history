"""SQLite storage helpers for Shopping History.

All methods in this module are synchronous by design. Home Assistant callers must run
these methods in the executor so SQLite and filesystem I/O never block the event loop.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sqlite3
from typing import Any


class ShoppingHistoryStorageError(Exception):
    """Base storage error."""


class OrderNotFoundError(ShoppingHistoryStorageError):
    """Raised when an order cannot be found."""


@dataclass(slots=True)
class ShoppingHistoryStore:
    """Small SQLite repository for a single Shopping History config entry."""

    db_path: str

    def _connect(self) -> sqlite3.Connection:
        """Open a configured SQLite connection."""
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout = 10000")
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA synchronous = NORMAL")
        return conn

    def initialize(self) -> None:
        """Create/migrate the database and lightweight query indexes."""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)

        conn = self._connect()
        try:
            # WAL persists in the database and improves read/write concurrency for the
            # dashboard and service actions. This is executed outside a transaction.
            conn.execute("PRAGMA journal_mode = WAL")
            with conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS purchases (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        ngay_mua TEXT,
                        nam INTEGER,
                        thang INTEGER,
                        ngay INTEGER,
                        ten_hang TEXT,
                        noi_mua TEXT,
                        so_luong REAL,
                        don_gia REAL,
                        thanh_tien REAL,
                        vat_percent REAL,
                        tien_vat REAL,
                        thanh_tien_sau_vat REAL,
                        model TEXT,
                        tinh_trang TEXT,
                        nganh_hang TEXT,
                        hang_sx TEXT,
                        thoi_gian_bh_thang INTEGER,
                        ngay_het_bh TEXT,
                        ghi_chu TEXT DEFAULT ''
                    )
                    """
                )

                columns = {
                    row["name"] for row in conn.execute("PRAGMA table_info(purchases)")
                }
                if "noi_mua" not in columns:
                    conn.execute(
                        "ALTER TABLE purchases ADD COLUMN noi_mua TEXT DEFAULT ''"
                    )
                if "ghi_chu" not in columns:
                    conn.execute(
                        "ALTER TABLE purchases ADD COLUMN ghi_chu TEXT DEFAULT ''"
                    )

                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS shopping_meta (
                        key TEXT PRIMARY KEY,
                        value INTEGER NOT NULL
                    )
                    """
                )
                conn.execute(
                    "INSERT OR IGNORE INTO shopping_meta(key, value) VALUES('revision', 0)"
                )

                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_purchases_nam ON purchases(nam)"
                )
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_purchases_nam_ngay_mua
                    ON purchases(nam, ngay_mua DESC, id DESC)
                    """
                )
        finally:
            conn.close()

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
        """Convert a SQLite row to JSON-friendly values expected by the card."""
        return {key: "" if value is None else value for key, value in dict(row).items()}

    @staticmethod
    def _bump_revision(conn: sqlite3.Connection) -> None:
        conn.execute(
            "UPDATE shopping_meta SET value = value + 1 WHERE key = 'revision'"
        )

    def get_years(self) -> list[int]:
        """Return years that contain purchases."""
        conn = self._connect()
        try:
            rows = conn.execute(
                """
                SELECT DISTINCT nam
                FROM purchases
                WHERE nam IS NOT NULL
                ORDER BY nam DESC
                """
            ).fetchall()
            return [int(row[0]) for row in rows]
        finally:
            conn.close()

    def get_year_summary(self, year: int) -> dict[str, int | float]:
        """Return only recorder-safe aggregate data for one year."""
        conn = self._connect()
        try:
            row = conn.execute(
                """
                SELECT
                    COUNT(*) AS orders,
                    COALESCE(SUM(so_luong), 0) AS quantity,
                    COALESCE(SUM(thanh_tien_sau_vat), 0) AS total
                FROM purchases
                WHERE nam = ?
                """,
                (year,),
            ).fetchone()
            revision_row = conn.execute(
                "SELECT value FROM shopping_meta WHERE key = 'revision'"
            ).fetchone()
            return {
                "orders": int(row["orders"] if row else 0),
                "quantity": float(row["quantity"] if row else 0),
                "total": int(round(float(row["total"] if row else 0))),
                "revision": int(revision_row[0] if revision_row else 0),
            }
        finally:
            conn.close()

    def get_orders(self, year: int | None = None) -> list[dict[str, Any]]:
        """Return orders for the dashboard, optionally filtered by year."""
        conn = self._connect()
        try:
            if year is None:
                rows = conn.execute(
                    "SELECT * FROM purchases ORDER BY ngay_mua DESC, id DESC"
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT * FROM purchases
                    WHERE nam = ?
                    ORDER BY ngay_mua DESC, id DESC
                    """,
                    (year,),
                ).fetchall()
            return [self._row_to_dict(row) for row in rows]
        finally:
            conn.close()

    def get_dashboard_data(self, year: int | None = None) -> dict[str, Any]:
        """Return dashboard data over Home Assistant's WebSocket API."""
        conn = self._connect()
        try:
            years = [
                int(row[0])
                for row in conn.execute(
                    """
                    SELECT DISTINCT nam
                    FROM purchases
                    WHERE nam IS NOT NULL
                    ORDER BY nam DESC
                    """
                ).fetchall()
            ]
            if year is None:
                rows = conn.execute(
                    "SELECT * FROM purchases ORDER BY ngay_mua DESC, id DESC"
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT * FROM purchases
                    WHERE nam = ?
                    ORDER BY ngay_mua DESC, id DESC
                    """,
                    (year,),
                ).fetchall()
            revision_row = conn.execute(
                "SELECT value FROM shopping_meta WHERE key = 'revision'"
            ).fetchone()
            return {
                "years": years,
                "revision": int(revision_row[0] if revision_row else 0),
                "items": [self._row_to_dict(row) for row in rows],
            }
        finally:
            conn.close()

    def add_order(self, order: dict[str, Any]) -> int:
        """Insert an order and return its database id."""
        conn = self._connect()
        try:
            with conn:
                cursor = conn.execute(
                    """
                    INSERT INTO purchases (
                        ngay_mua, nam, thang, ngay,
                        ten_hang, noi_mua, so_luong, don_gia, thanh_tien,
                        vat_percent, tien_vat, thanh_tien_sau_vat,
                        model, tinh_trang, nganh_hang, hang_sx,
                        thoi_gian_bh_thang, ngay_het_bh, ghi_chu
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        order["ngay_mua"],
                        order["nam"],
                        order["thang"],
                        order["ngay"],
                        order["ten_hang"],
                        order["noi_mua"],
                        order["so_luong"],
                        order["don_gia"],
                        order["thanh_tien"],
                        order["vat_percent"],
                        order["tien_vat"],
                        order["thanh_tien_sau_vat"],
                        order["model"],
                        order["tinh_trang"],
                        order["nganh_hang"],
                        order["hang_sx"],
                        order["thoi_gian_bh_thang"],
                        order["ngay_het_bh"],
                        order["ghi_chu"],
                    ),
                )
                self._bump_revision(conn)
                return int(cursor.lastrowid)
        finally:
            conn.close()

    def edit_order(self, order_id: int, order: dict[str, Any]) -> None:
        """Update an existing order."""
        conn = self._connect()
        try:
            with conn:
                cursor = conn.execute(
                    """
                    UPDATE purchases SET
                        ngay_mua = ?, nam = ?, thang = ?, ngay = ?,
                        ten_hang = ?, noi_mua = ?, so_luong = ?, don_gia = ?,
                        thanh_tien = ?, vat_percent = ?, tien_vat = ?,
                        thanh_tien_sau_vat = ?, model = ?, tinh_trang = ?,
                        nganh_hang = ?, hang_sx = ?, thoi_gian_bh_thang = ?,
                        ngay_het_bh = ?, ghi_chu = ?
                    WHERE id = ?
                    """,
                    (
                        order["ngay_mua"],
                        order["nam"],
                        order["thang"],
                        order["ngay"],
                        order["ten_hang"],
                        order["noi_mua"],
                        order["so_luong"],
                        order["don_gia"],
                        order["thanh_tien"],
                        order["vat_percent"],
                        order["tien_vat"],
                        order["thanh_tien_sau_vat"],
                        order["model"],
                        order["tinh_trang"],
                        order["nganh_hang"],
                        order["hang_sx"],
                        order["thoi_gian_bh_thang"],
                        order["ngay_het_bh"],
                        order["ghi_chu"],
                        order_id,
                    ),
                )
                if cursor.rowcount != 1:
                    raise OrderNotFoundError(f"Order {order_id} does not exist")
                self._bump_revision(conn)
        finally:
            conn.close()

    def delete_order(self, order_id: int) -> None:
        """Delete an existing order."""
        conn = self._connect()
        try:
            with conn:
                cursor = conn.execute("DELETE FROM purchases WHERE id = ?", (order_id,))
                if cursor.rowcount != 1:
                    raise OrderNotFoundError(f"Order {order_id} does not exist")
                self._bump_revision(conn)
        finally:
            conn.close()
