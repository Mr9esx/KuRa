package database

import (
	"github.com/Mr9esx/RiSu/server/internal/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Open(dbPath string) (*gorm.DB, error) {
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
	); err != nil {
		return nil, err
	}

	return db, nil
}
