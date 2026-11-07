"""Standalone SQLite regression tests (no running Home Assistant needed)."""

import importlib.util
from pathlib import Path
import sqlite3
import sys
from concurrent.futures import ThreadPoolExecutor

import pytest

MODULE_PATH = (
    Path(__file__).resolve().parents[1]
    / 'custom_components/shopping_history/storage.py'
)
spec = importlib.util.spec_from_file_location('shopping_history_storage_test', MODULE_PATH)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
ShoppingHistoryStore = module.ShoppingHistoryStore
OrderNotFoundError = module.OrderNotFoundError


def order(year=2026, name='Điện thoại', price=1050000.25, quantity=2):
    gross = price * quantity
    return {
        'ngay_mua': f'{year}-11-07', 'nam': year, 'thang': 11, 'ngay': 7,
        'ten_hang': name, 'noi_mua': 'Cửa hàng thử nghiệm',
        'so_luong': quantity, 'don_gia': price, 'thanh_tien': gross,
        'vat_percent': 10, 'tien_vat': gross * 0.1,
        'thanh_tien_sau_vat': gross * 1.1, 'model': 'ABC',
        'tinh_trang': 'Mới', 'nganh_hang': 'Đồ điện tử', 'hang_sx': 'Hãng X',
        'thoi_gian_bh_thang': 12, 'ngay_het_bh': f'{year + 1}-11-07',
        'ghi_chu': 'Thông tin riêng tư',
    }


@pytest.fixture
def store(tmp_path):
    repo = ShoppingHistoryStore(str(tmp_path / 'storage' / 'orders.sqlite'))
    repo.initialize()
    return repo


def test_new_database_and_empty_data(store):
    assert store.get_years() == []
    assert store.get_year_summaries() == ({}, 0)
    assert store.get_dashboard_data() == {'years': [], 'revision': 0, 'items': []}
    health = store.get_diagnostics()
    assert health['journal_mode'] == 'wal'
    assert health['schema_version'] == 1
    assert health['purchase_count'] == 0
    assert health['revision'] == 0


def test_create_update_delete_and_revision(store):
    first = store.add_order(order())
    second = store.add_order(order(2025, name='Laptop', price=20000000, quantity=1))
    assert (first, second) == (1, 2)
    data = store.get_dashboard_data()
    assert data['years'] == [2026, 2025]
    assert data['revision'] == 2
    assert len(data['items']) == 2
    assert store.get_dashboard_data(if_revision=2) == {'revision': 2, 'unchanged': True}
    assert len(store.get_dashboard_data(year=2025)['items']) == 1
    sums, revision = store.get_year_summaries()
    assert revision == 2
    assert sums[2026]['orders'] == 1
    assert sums[2026]['quantity'] == 2
    assert sums[2025]['total'] == 22000000

    edited = order(2024, price=1000, quantity=3)
    store.edit_order(first, edited)
    assert store.get_dashboard_data()['years'] == [2025, 2024]
    assert store.get_dashboard_data()['revision'] == 3
    assert store.get_year_summary(2024)['total'] == 3300

    store.delete_order(second)
    assert store.get_dashboard_data()['revision'] == 4
    assert store.get_years() == [2024]
    with pytest.raises(OrderNotFoundError):
        store.delete_order(second)
    with pytest.raises(OrderNotFoundError):
        store.edit_order(second, edited)
    assert store.get_dashboard_data()['revision'] == 4
    store.delete_order(first)
    assert store.get_year_summaries() == ({}, 5)


def test_initialize_is_idempotent_and_keeps_legacy_data(tmp_path):
    db_file = tmp_path / 'shopping_history' / 'legacy.db'
    db_file.parent.mkdir()
    with sqlite3.connect(db_file) as conn:
        conn.execute('''CREATE TABLE purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT, ngay_mua TEXT, nam INTEGER,
            thang INTEGER, ngay INTEGER, ten_hang TEXT, so_luong REAL,
            don_gia REAL, thanh_tien REAL, vat_percent REAL, tien_vat REAL,
            thanh_tien_sau_vat REAL, model TEXT, tinh_trang TEXT,
            nganh_hang TEXT, hang_sx TEXT, thoi_gian_bh_thang INTEGER,
            ngay_het_bh TEXT)''')
        conn.execute("INSERT INTO purchases (ngay_mua,nam,ten_hang,thanh_tien_sau_vat) VALUES ('2024-01-01', 2024, 'Bản ghi cũ', 1234)")
    repo = ShoppingHistoryStore(str(db_file))
    repo.initialize()
    repo.initialize()
    result = repo.get_dashboard_data()
    assert result['items'][0]['ten_hang'] == 'Bản ghi cũ'
    assert result['items'][0]['noi_mua'] == ''
    assert result['items'][0]['ghi_chu'] == ''
    assert result['years'] == [2024]
    assert repo.get_diagnostics()['purchase_count'] == 1


def test_concurrent_requests_do_not_lose_revision(store):
    with ThreadPoolExecutor(max_workers=5) as pool:
        ids = list(pool.map(lambda n: store.add_order(order(name=f'Order {n}')), range(20)))
    assert len(set(ids)) == 20
    assert store.get_dashboard_data()['revision'] == 20
    assert store.get_year_summaries()[0][2026]['orders'] == 20


def test_diagnostics_never_discloses_purchase_data(store):
    store.add_order(order(name='Sensitive order'))
    result = str(store.get_diagnostics())
    assert 'Sensitive' not in result
    assert 'Thông tin riêng tư' not in result
    assert 'Cửa hàng' not in result
