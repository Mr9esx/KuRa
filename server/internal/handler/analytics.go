package handler

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Mr9esx/RiSu/server/internal/geo"
	"github.com/Mr9esx/RiSu/server/internal/model"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

type AnalyticsHandler struct {
	DB       *gorm.DB
	Resolver *geo.Resolver
}

type TrackEventRequest struct {
	EventName  string                 `json:"event_name"`
	UserID     string                 `json:"user_id"`
	VisitorID  string                 `json:"visitor_id"`
	SessionID  string                 `json:"session_id"`
	PagePath   string                 `json:"page_path"`
	PageURL    string                 `json:"page_url"`
	Referrer   string                 `json:"referrer"`
	DeviceType string                 `json:"device_type"`
	OS         string                 `json:"os"`
	Browser    string                 `json:"browser"`
	OccurredAt string                 `json:"occurred_at"`
	Properties map[string]interface{} `json:"properties"`
}

func (h *AnalyticsHandler) Track(c echo.Context) error {
	var req TrackEventRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	eventName := strings.TrimSpace(req.EventName)
	if eventName == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "event_name is required"})
	}

	occurredAt := time.Now().UTC()
	if req.OccurredAt != "" {
		parsed, err := time.Parse(time.RFC3339, req.OccurredAt)
		if err == nil {
			occurredAt = parsed.UTC()
		}
	}

	props := "{}"
	if req.Properties != nil {
		raw, err := json.Marshal(req.Properties)
		if err == nil {
			props = string(raw)
		}
	}

	event := &model.AnalyticsEvent{
		EventName:  eventName,
		UserID:     strings.TrimSpace(req.UserID),
		VisitorID:  strings.TrimSpace(req.VisitorID),
		SessionID:  strings.TrimSpace(req.SessionID),
		PagePath:   strings.TrimSpace(req.PagePath),
		PageURL:    strings.TrimSpace(req.PageURL),
		Referrer:   strings.TrimSpace(req.Referrer),
		DeviceType: strings.TrimSpace(req.DeviceType),
		OS:         strings.TrimSpace(req.OS),
		Browser:    strings.TrimSpace(req.Browser),
		Properties: props,
		OccurredAt: occurredAt,
	}

	clientIP := extractClientIP(c)
	event.IP = clientIP
	if h.Resolver != nil && clientIP != "" {
		if info := h.Resolver.Lookup(clientIP); info != nil {
			event.Country = info.Country
			event.Region = info.Region
			event.City = info.City
			event.Latitude = &info.Lat
			event.Longitude = &info.Lng
		}
	}

	if event.DeviceType == "" {
		event.DeviceType = "unknown"
	}
	if event.PagePath == "" {
		event.PagePath = "/"
	}

	if err := h.DB.Create(event).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	return c.JSON(http.StatusAccepted, map[string]bool{"ok": true})
}

func (h *AnalyticsHandler) Overview(c echo.Context) error {
	days := 30
	if raw := c.QueryParam("days"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			if parsed < 1 {
				parsed = 1
			}
			if parsed > 180 {
				parsed = 180
			}
			days = parsed
		}
	}

	fromExpr := fmt.Sprintf("-%d days", days-1)

	type summaryRow struct {
		Events         int64
		UniqueUsers    int64
		UniqueVisitors int64
		Sessions       int64
	}
	var summary summaryRow
	if err := h.DB.
		Table("analytics_events").
		Select(`
			COUNT(*) as events,
			COUNT(DISTINCT CASE WHEN user_id <> '' THEN user_id END) as unique_users,
			COUNT(DISTINCT visitor_id) as unique_visitors,
			COUNT(DISTINCT session_id) as sessions
		`).
		Where("occurred_at >= datetime('now', ?)", fromExpr).
		Scan(&summary).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	type trendRow struct {
		Date     string `json:"date"`
		Events   int64  `json:"events"`
		Visitors int64  `json:"visitors"`
		Sessions int64  `json:"sessions"`
	}
	var trendRows []trendRow
	if err := h.DB.
		Table("analytics_events").
		Select("strftime('%Y-%m-%d', occurred_at) as date, COUNT(*) as events, COUNT(DISTINCT visitor_id) as visitors, COUNT(DISTINCT session_id) as sessions").
		Where("occurred_at >= datetime('now', ?)", fromExpr).
		Group("date").
		Order("date asc").
		Scan(&trendRows).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	trendMap := make(map[string]trendRow, len(trendRows))
	for _, row := range trendRows {
		trendMap[row.Date] = row
	}

	trend := make([]trendRow, 0, days)
	now := time.Now().UTC()
	for i := days - 1; i >= 0; i-- {
		d := now.AddDate(0, 0, -i).Format("2006-01-02")
		if row, ok := trendMap[d]; ok {
			trend = append(trend, row)
		} else {
			trend = append(trend, trendRow{
				Date:     d,
				Events:   0,
				Visitors: 0,
				Sessions: 0,
			})
		}
	}

	type namedCount struct {
		Name  string `json:"name"`
		Count int64  `json:"count"`
	}

	var topPages []namedCount
	if err := h.DB.
		Table("analytics_events").
		Select("page_path as name, COUNT(*) as count").
		Where("occurred_at >= datetime('now', ?)", fromExpr).
		Where("page_path <> ''").
		Group("page_path").
		Order("count desc").
		Limit(8).
		Scan(&topPages).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	if topPages == nil {
		topPages = []namedCount{}
	}

	var topEvents []namedCount
	if err := h.DB.
		Table("analytics_events").
		Select("event_name as name, COUNT(*) as count").
		Where("occurred_at >= datetime('now', ?)", fromExpr).
		Group("event_name").
		Order("count desc").
		Limit(8).
		Scan(&topEvents).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	if topEvents == nil {
		topEvents = []namedCount{}
	}

	var devices []namedCount
	if err := h.DB.
		Table("analytics_events").
		Select("CASE WHEN device_type = '' THEN 'unknown' ELSE device_type END as name, COUNT(*) as count").
		Where("occurred_at >= datetime('now', ?)", fromExpr).
		Group("name").
		Order("count desc").
		Limit(8).
		Scan(&devices).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	if devices == nil {
		devices = []namedCount{}
	}

	type recentEvent struct {
		ID         uint      `json:"id"`
		EventName  string    `json:"event_name"`
		PagePath   string    `json:"page_path"`
		DeviceType string    `json:"device_type"`
		City       string    `json:"city"`
		IP         string    `json:"ip"`
		OccurredAt time.Time `json:"occurred_at"`
	}
	var recentEvents []recentEvent
	if err := h.DB.
		Table("analytics_events").
		Select("id, event_name, page_path, device_type, city, ip, occurred_at").
		Order("occurred_at desc").
		Limit(10).
		Scan(&recentEvents).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	if recentEvents == nil {
		recentEvents = []recentEvent{}
	}

	type hotspot struct {
		Country string   `json:"country"`
		Region  string   `json:"region"`
		City    string   `json:"city"`
		Lat     *float64 `json:"lat"`
		Lng     *float64 `json:"lng"`
		Count   int64    `json:"count"`
	}
	var hotspots []hotspot
	if err := h.DB.
		Table("analytics_events").
		Select("country, region, city, latitude as lat, longitude as lng, COUNT(*) as count").
		Where("occurred_at >= datetime('now', ?)", fromExpr).
		Where("latitude IS NOT NULL AND longitude IS NOT NULL").
		Group("country, region, city, latitude, longitude").
		Order("count desc").
		Limit(100).
		Scan(&hotspots).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	if hotspots == nil {
		hotspots = []hotspot{}
	}

	type last24Row struct {
		Events         int64
		ActiveVisitors int64
	}
	var last24 last24Row
	if err := h.DB.
		Table("analytics_events").
		Select("COUNT(*) as events, COUNT(DISTINCT visitor_id) as active_visitors").
		Where("occurred_at >= datetime('now', '-1 day')").
		Scan(&last24).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	avgEventsPerSession := 0.0
	if summary.Sessions > 0 {
		avgEventsPerSession = float64(summary.Events) / float64(summary.Sessions)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"days": days,
		"summary": map[string]interface{}{
			"events":                   summary.Events,
			"unique_users":             summary.UniqueUsers,
			"unique_visitors":          summary.UniqueVisitors,
			"sessions":                 summary.Sessions,
			"avg_events_per_session":   avgEventsPerSession,
			"last_24h_events":          last24.Events,
			"last_24h_active_visitors": last24.ActiveVisitors,
		},
		"trend":         trend,
		"top_pages":     topPages,
		"top_events":    topEvents,
		"devices":       devices,
		"geo_hotspots":  hotspots,
		"recent_events": recentEvents,
	})
}

func (h *AnalyticsHandler) ListEvents(c echo.Context) error {
	page := 1
	limit := 20
	if raw := c.QueryParam("page"); raw != "" {
		if p, err := strconv.Atoi(raw); err == nil && p > 0 {
			page = p
		}
	}
	if raw := c.QueryParam("limit"); raw != "" {
		if l, err := strconv.Atoi(raw); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	query := h.DB.Table("analytics_events")
	if eventName := strings.TrimSpace(c.QueryParam("event_name")); eventName != "" {
		query = query.Where("event_name = ?", eventName)
	}
	if deviceType := strings.TrimSpace(c.QueryParam("device_type")); deviceType != "" {
		query = query.Where("device_type = ?", deviceType)
	}

	var total int64
	query.Count(&total)

	type eventRow struct {
		ID         uint      `json:"id"`
		EventName  string    `json:"event_name"`
		PagePath   string    `json:"page_path"`
		PageURL    string    `json:"page_url"`
		DeviceType string    `json:"device_type"`
		OS         string    `json:"os"`
		Browser    string    `json:"browser"`
		IP         string    `json:"ip"`
		Country    string    `json:"country"`
		Region     string    `json:"region"`
		City       string    `json:"city"`
		OccurredAt time.Time `json:"occurred_at"`
	}
	var events []eventRow
	query.
		Select("id, event_name, page_path, page_url, device_type, os, browser, ip, country, region, city, occurred_at").
		Order("occurred_at desc").
		Offset((page - 1) * limit).
		Limit(limit).
		Scan(&events)

	if events == nil {
		events = []eventRow{}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"events": events,
		"total":  total,
		"page":   page,
		"limit":  limit,
	})
}

func (h *AnalyticsHandler) Insights(c echo.Context) error {
	days := 30
	if raw := c.QueryParam("days"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			if parsed < 1 {
				parsed = 1
			}
			if parsed > 180 {
				parsed = 180
			}
			days = parsed
		}
	}

	fromExpr := fmt.Sprintf("-%d days", days-1)

	// 1. Hourly heatmap: weekday × hour → session count
	type heatmapCell struct {
		Weekday  int   `json:"weekday"`
		Hour     int   `json:"hour"`
		Sessions int64 `json:"sessions"`
	}
	var heatmap []heatmapCell
	if err := h.DB.
		Table("analytics_events").
		Select("CAST(strftime('%w', occurred_at) AS INTEGER) AS weekday, CAST(strftime('%H', occurred_at) AS INTEGER) AS hour, COUNT(DISTINCT session_id) AS sessions").
		Where("occurred_at >= datetime('now', ?)", fromExpr).
		Group("weekday, hour").
		Order("weekday, hour").
		Scan(&heatmap).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	if heatmap == nil {
		heatmap = []heatmapCell{}
	}

	// 2. Item popularity: top items by select/place/remove counts, joined with product name
	type itemRow struct {
		SKU         string `json:"sku"`
		DisplayName string `json:"display_name"`
		SelectCount int64  `json:"select_count"`
		PlaceCount  int64  `json:"place_count"`
		RemoveCount int64  `json:"remove_count"`
	}
	var items []itemRow
	if err := h.DB.Raw(`
		SELECT
			a.sku,
			COALESCE(p.display_name, a.sku) AS display_name,
			a.select_count,
			a.place_count,
			a.remove_count
		FROM (
			SELECT
				json_extract(properties, '$.sku') AS sku,
				SUM(CASE WHEN event_name IN ('catalog_item_select', 'placement_select') THEN 1 ELSE 0 END) AS select_count,
				SUM(CASE WHEN event_name = 'item_place' THEN 1 ELSE 0 END) AS place_count,
				SUM(CASE WHEN event_name = 'item_remove' THEN 1 ELSE 0 END) AS remove_count
			FROM analytics_events
			WHERE event_name IN ('catalog_item_select', 'placement_select', 'item_place', 'item_remove')
			  AND occurred_at >= datetime('now', ?)
			  AND json_extract(properties, '$.sku') IS NOT NULL
			GROUP BY sku
		) a
		LEFT JOIN products p ON p.sku = a.sku
		ORDER BY a.place_count DESC
		LIMIT 20
	`, fromExpr).Scan(&items).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	if items == nil {
		items = []itemRow{}
	}

	// 3. Funnel: unique sessions reaching each stage
	type funnelRow struct {
		PageViews   int64 `json:"page_views"`
		ItemSelects int64 `json:"item_selects"`
		ItemPlaces  int64 `json:"item_places"`
		Exports     int64 `json:"exports"`
	}
	var funnel funnelRow
	if err := h.DB.
		Table("analytics_events").
		Select(`
			COUNT(DISTINCT CASE WHEN event_name = 'page_view' THEN session_id END) AS page_views,
			COUNT(DISTINCT CASE WHEN event_name IN ('catalog_item_select', 'placement_select') THEN session_id END) AS item_selects,
			COUNT(DISTINCT CASE WHEN event_name = 'item_place' THEN session_id END) AS item_places,
			COUNT(DISTINCT CASE WHEN event_name = 'layout_export' THEN session_id END) AS exports
		`).
		Where("occurred_at >= datetime('now', ?)", fromExpr).
		Scan(&funnel).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"days":            days,
		"hourly_heatmap":  heatmap,
		"item_popularity": items,
		"funnel":          funnel,
	})
}

func (h *AnalyticsHandler) Visitors(c echo.Context) error {
	days := 30
	if raw := c.QueryParam("days"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			if parsed < 1 {
				parsed = 1
			}
			if parsed > 180 {
				parsed = 180
			}
			days = parsed
		}
	}

	fromExpr := fmt.Sprintf("-%d days", days-1)

	// 1. New vs returning visitors
	type newReturnRow struct {
		NewVisitors       int64 `json:"new_visitors"`
		ReturningVisitors int64 `json:"returning_visitors"`
	}
	var newReturn newReturnRow
	h.DB.Raw(`
		WITH visitor_sessions AS (
			SELECT visitor_id, COUNT(DISTINCT session_id) AS sess_count
			FROM analytics_events
			WHERE occurred_at >= datetime('now', ?)
			GROUP BY visitor_id
		)
		SELECT
			SUM(CASE WHEN sess_count = 1 THEN 1 ELSE 0 END) AS new_visitors,
			SUM(CASE WHEN sess_count > 1 THEN 1 ELSE 0 END) AS returning_visitors
		FROM visitor_sessions
	`, fromExpr).Scan(&newReturn)

	// 2. Engagement tiers: by action count per visitor
	type engagementTier struct {
		Tier    string `json:"tier"`
		Count   int64  `json:"count"`
	}
	var engagement []engagementTier
	h.DB.Raw(`
		WITH visitor_actions AS (
			SELECT visitor_id, COUNT(*) AS action_count
			FROM analytics_events
			WHERE occurred_at >= datetime('now', ?)
			  AND event_name NOT IN ('page_view', 'session_start', 'session_end')
			GROUP BY visitor_id
		)
		SELECT tier, COUNT(*) AS count FROM (
			SELECT CASE
				WHEN action_count = 0 THEN '仅浏览'
				WHEN action_count BETWEEN 1 AND 5 THEN '轻度互动'
				WHEN action_count BETWEEN 6 AND 20 THEN '中度互动'
				ELSE '深度互动'
			END AS tier
			FROM visitor_actions
		) GROUP BY tier
	`, fromExpr).Scan(&engagement)
	if engagement == nil {
		engagement = []engagementTier{}
	}

	// 3. Top visitors by action count with behavior summary
	type topVisitor struct {
		VisitorID    string  `json:"visitor_id"`
		Sessions     int64   `json:"sessions"`
		Events       int64   `json:"events"`
		Actions      int64   `json:"actions"`
		Exports      int64   `json:"exports"`
		Imports      int64   `json:"imports"`
		Presets      int64   `json:"presets"`
		DeviceType   string  `json:"device_type"`
		City         string  `json:"city"`
		AvgDuration  float64 `json:"avg_duration_ms"`
		LastActiveAt string  `json:"last_active_at"`
	}
	var topVisitors []topVisitor
	h.DB.Raw(`
		SELECT
			visitor_id,
			COUNT(DISTINCT session_id) AS sessions,
			COUNT(*) AS events,
			SUM(CASE WHEN event_name NOT IN ('page_view', 'session_start', 'session_end') THEN 1 ELSE 0 END) AS actions,
			SUM(CASE WHEN event_name = 'layout_export' THEN 1 ELSE 0 END) AS exports,
			SUM(CASE WHEN event_name = 'layout_import' THEN 1 ELSE 0 END) AS imports,
			SUM(CASE WHEN event_name = 'preset_apply' THEN 1 ELSE 0 END) AS presets,
			MAX(device_type) AS device_type,
			MAX(city) AS city,
			MAX(occurred_at) AS last_active_at
		FROM analytics_events
		WHERE occurred_at >= datetime('now', ?)
		GROUP BY visitor_id
		ORDER BY actions DESC
		LIMIT 20
	`, fromExpr).Scan(&topVisitors)
	if topVisitors == nil {
		topVisitors = []topVisitor{}
	}

	for i := range topVisitors {
		var avgDur struct {
			Avg float64
		}
		h.DB.Raw(`
			SELECT AVG(CAST(json_extract(properties, '$.duration_ms') AS REAL)) AS avg
			FROM analytics_events
			WHERE visitor_id = ? AND event_name = 'session_end'
			  AND occurred_at >= datetime('now', ?)
		`, topVisitors[i].VisitorID, fromExpr).Scan(&avgDur)
		topVisitors[i].AvgDuration = avgDur.Avg
	}

	// 4. Overall average session duration
	var avgSession struct {
		AvgDuration float64 `json:"avg_duration"`
		AvgTotal    float64 `json:"avg_total"`
	}
	h.DB.Raw(`
		SELECT
			AVG(CAST(json_extract(properties, '$.duration_ms') AS REAL)) AS avg_duration,
			AVG(CAST(json_extract(properties, '$.total_duration_ms') AS REAL)) AS avg_total
		FROM analytics_events
		WHERE event_name = 'session_end'
		  AND occurred_at >= datetime('now', ?)
	`, fromExpr).Scan(&avgSession)

	// 5. Browser & OS distribution
	type distRow struct {
		Name  string `json:"name"`
		Count int64  `json:"count"`
	}
	var browsers []distRow
	h.DB.Table("analytics_events").
		Select("browser AS name, COUNT(DISTINCT visitor_id) AS count").
		Where("occurred_at >= datetime('now', ?)", fromExpr).
		Where("browser <> ''").
		Group("browser").
		Order("count DESC").
		Limit(10).
		Scan(&browsers)
	if browsers == nil {
		browsers = []distRow{}
	}

	var oses []distRow
	h.DB.Table("analytics_events").
		Select("os AS name, COUNT(DISTINCT visitor_id) AS count").
		Where("occurred_at >= datetime('now', ?)", fromExpr).
		Where("os <> ''").
		Group("os").
		Order("count DESC").
		Limit(10).
		Scan(&oses)
	if oses == nil {
		oses = []distRow{}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"days": days,
		"new_vs_returning": newReturn,
		"engagement":       engagement,
		"top_visitors":     topVisitors,
		"avg_session": map[string]interface{}{
			"visible_ms": avgSession.AvgDuration,
			"total_ms":   avgSession.AvgTotal,
		},
		"browsers": browsers,
		"oses":     oses,
	})
}

func extractClientIP(c echo.Context) string {
	if forwardedFor := strings.TrimSpace(c.Request().Header.Get("X-Forwarded-For")); forwardedFor != "" {
		parts := strings.Split(forwardedFor, ",")
		if len(parts) > 0 {
			ip := strings.TrimSpace(parts[0])
			if net.ParseIP(ip) != nil {
				return ip
			}
		}
	}

	if realIP := strings.TrimSpace(c.Request().Header.Get("X-Real-IP")); realIP != "" {
		if net.ParseIP(realIP) != nil {
			return realIP
		}
	}

	ip := strings.TrimSpace(c.RealIP())
	if net.ParseIP(ip) != nil {
		return ip
	}

	host, _, err := net.SplitHostPort(strings.TrimSpace(c.Request().RemoteAddr))
	if err == nil && net.ParseIP(host) != nil {
		return host
	}
	return ""
}
