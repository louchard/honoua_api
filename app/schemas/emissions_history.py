from datetime import datetime
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from enum import Enum

class Interval(str, Enum):
    day = "day"
    week = "week"
    month = "month"

class Metric(str, Enum):
    sum = "sum"
    avg = "avg"
    count = "count"
    min = "min"
    max = "max"

class GroupBy(str, Enum):
    none = "none"
    category = "category"
    store = "store"
    brand = "brand"
    product = "product"

class Normalize(str, Enum):
    none = "none"
    per_unit = "per_unit"
    per_euro = "per_euro"

class HistoryQuery(BaseModel):
    from_: Optional[datetime] = Field(None, alias="from")
    to: Optional[datetime] = None
    interval: Interval
    metrics: Optional[List[Metric]] = None
    group_by: GroupBy = GroupBy.none
    scope: Literal["user", "org"] = "user"
    scope_id: Optional[str] = None
    normalize: Normalize = Normalize.none
    tz: str = "Europe/Paris"
    limit: int = 366

    class Config:
        allow_population_by_field_name = True

class DataPoint(BaseModel):
    t: datetime
    sum: Optional[float] = None
    avg: Optional[float] = None
    count: Optional[int] = None
    min: Optional[float] = None
    max: Optional[float] = None
    group: Optional[str] = None

class HistorySummary(BaseModel):
    sum_total: Optional[float] = None
    trend_slope_per_interval: Optional[float] = None
    count_points: int

class HistoryResponse(BaseModel):
    interval: Interval
    from_: Optional[datetime] = Field(None, alias="from")
    to: Optional[datetime] = None
    group_by: GroupBy
    series: List[DataPoint]
    summary: HistorySummary
    export_ready: bool = True
