package model

import "time"

type ReleaseRecord struct {
	ID           uint       `gorm:"primaryKey" json:"id"`
	ReleaseID    string     `gorm:"uniqueIndex;not null" json:"release_id"`
	Branch       string     `gorm:"index;not null" json:"branch"`
	BeforeSHA    string     `json:"before_sha"`
	AfterSHA     string     `json:"after_sha"`
	ArtifactPath string     `json:"artifact_path"`
	DiffSummary  string     `gorm:"type:text" json:"diff_summary"`
	DataSnapshot string     `gorm:"type:text" json:"-"`
	Status       string     `gorm:"index;not null;default:deployed" json:"status"` // deployed | rolled_back | failed
	DeployedAt   time.Time  `gorm:"index" json:"deployed_at"`
	RolledBackAt *time.Time `json:"rolled_back_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type ReleaseRollback struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	FromReleaseID string    `gorm:"index;not null" json:"from_release_id"`
	ToReleaseID   string    `gorm:"index;not null" json:"to_release_id"`
	Operator      string    `json:"operator"`
	Reason        string    `json:"reason"`
	CreatedAt     time.Time `json:"created_at"`
}
