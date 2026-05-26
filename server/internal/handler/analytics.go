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
