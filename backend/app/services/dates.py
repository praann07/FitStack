from datetime import date, timedelta


def shift_date(d: date, days: int) -> date:
    return d + timedelta(days=days)


def week_start(d: date) -> date:
    """Monday-based week start, matching the weekly volume aggregation."""
    return d - timedelta(days=d.weekday())


def date_range(start: date, end: date) -> list[date]:
    total = (end - start).days
    return [shift_date(start, i) for i in range(total + 1)]
