"""Validate monetary arithmetic directly from source without HA runtime."""

import ast
from calendar import monthrange
from datetime import date
from decimal import Decimal, InvalidOperation
import math
from pathlib import Path

import pytest

CODE = Path(__file__).resolve().parents[1] / 'custom_components/shopping_history/__init__.py'
parsed = ast.parse(CODE.read_text())
functions = [node for node in parsed.body if isinstance(node, ast.FunctionDef) and node.name in {'_add_months', '_build_order'}]
module = ast.Module(body=functions, type_ignores=[])

class HomeAssistantError(Exception):
    pass

class FakeDateTimeUtil:
    @staticmethod
    def now():
        from datetime import datetime
        return datetime(2026, 11, 7)

namespace = {
    'date': date, 'monthrange': monthrange, 'Decimal': Decimal,
    'InvalidOperation': InvalidOperation, 'math': math,
    'HomeAssistantError': HomeAssistantError, 'dt_util': FakeDateTimeUtil,
    'Any': object,
}
exec(compile(module, str(CODE), 'exec'), namespace)
_build_order = namespace['_build_order']
_add_months = namespace['_add_months']


def payload(**changes):
    data = {
        'purchase_date': date(2024, 1, 31), 'name': '  Sản phẩm  ',
        'place': ' Cửa hàng ', 'category': ' Gia dụng ', 'status': ' Mới ',
        'price': 0.1, 'quantity': 3, 'vat': 10,
        'warranty_months': 1, 'note': ' Ghi chú ',
        'model': '', 'manufacturer': '',
    }
    data.update(changes)
    return data


def test_precise_decimal_arithmetic_and_calendar_clamp():
    result = _build_order(payload())
    assert result['thanh_tien'] == 0.3
    assert result['tien_vat'] == 0.03
    assert result['thanh_tien_sau_vat'] == 0.33
    assert result['ngay_het_bh'] == '2024-02-29'
    assert result['ten_hang'] == 'Sản phẩm'
    assert result['ghi_chu'] == 'Ghi chú'
    assert _add_months(date(2025, 1, 31), 1) == date(2025, 2, 28)


@pytest.mark.parametrize('field,value', [
    ('price', float('nan')),
    ('price', float('inf')),
    ('price', -1),
    ('quantity', 0),
    ('vat', 101),
    ('vat', float('inf')),
    ('category', '   '),
    ('name', ''),
])
def test_reject_invalid_data(field, value):
    with pytest.raises(HomeAssistantError):
        _build_order(payload(**{field: value}))


def test_overflow_does_not_write_invalid_amounts():
    with pytest.raises(HomeAssistantError):
        _build_order(payload(price=1e308, quantity=1e308))
