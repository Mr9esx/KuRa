package database

import (
	"os"
	"path/filepath"

	"github.com/Mr9esx/RiSu/server/internal/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Open(dbPath string) (*gorm.DB, error) {
	if dir := filepath.Dir(dbPath); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			return nil, err
		}
	}

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}

	if err := db.AutoMigrate(
		&model.Product{},
		&model.Category{},
		&model.CategoryProduct{},
		&model.Preset{},
		&model.PresetItem{},
		&model.User{},
		&model.AnalyticsEvent{},
		&model.ReleaseRecord{},
		&model.ReleaseRollback{},
	); err != nil {
		return nil, err
	}

	return db, nil
}
