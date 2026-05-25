package model

import "time"

type AnalyticsEvent struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	EventName  string    `gorm:"not null;index" json:"event_name"`
	UserID     string    `gorm:"index" json:"user_id"`
	VisitorID  string    `gorm:"index" json:"visitor_id"`
	SessionID  string    `gorm:"index" json:"session_id"`
	IP         string    `gorm:"index" json:"ip"`
	PagePath   string    `gorm:"index" json:"page_path"`
	PageURL    string    `json:"page_url"`
	Referrer   string    `gorm:"index" json:"referrer"`
	DeviceType string    `gorm:"index" json:"device_type"`
	OS         string    `gorm:"index" json:"os"`
	Browser    string    `gorm:"index" json:"browser"`
	Country    string    `gorm:"index" json:"country"`
	Region     string    `gorm:"index" json:"region"`
	City       string    `gorm:"index" json:"city"`
	Latitude   *float64  `json:"latitude"`
	Longitude  *float64  `json:"longitude"`
	Properties string    `gorm:"type:text" json:"properties"`
	OccurredAt time.Time `gorm:"index" json:"occurred_at"`
	CreatedAt  time.Time `json:"created_at"`
}
