package service

import (
	"errors"
	"time"

	"github.com/Mr9esx/RiSu/server/internal/model"
	"gorm.io/gorm"
)

type ReleaseService struct {
	DB *gorm.DB
}

type CreateReleaseInput struct {
	ReleaseID    string
	Branch       string
	BeforeSHA    string
	AfterSHA     string
	ArtifactPath string
	DiffSummary  string
	DataSnapshot string
	Status       string
	DeployedAt   time.Time
}

type RecordRollbackInput struct {
	FromReleaseID string
	ToReleaseID   string
	Operator      string
	Reason        string
}

func (s *ReleaseService) UpsertRelease(input CreateReleaseInput) (*model.ReleaseRecord, error) {
	if input.ReleaseID == "" {
		return nil, errors.New("release_id is required")
	}
	if input.Branch == "" {
		input.Branch = "release"
	}
	if input.Status == "" {
		input.Status = "deployed"
	}
	if input.DeployedAt.IsZero() {
		input.DeployedAt = time.Now()
	}

	record := model.ReleaseRecord{
		ReleaseID:    input.ReleaseID,
		Branch:       input.Branch,
		BeforeSHA:    input.BeforeSHA,
		AfterSHA:     input.AfterSHA,
		ArtifactPath: input.ArtifactPath,
		DiffSummary:  input.DiffSummary,
		DataSnapshot: input.DataSnapshot,
		Status:       input.Status,
		DeployedAt:   input.DeployedAt,
	}

	if err := s.DB.
		Where("release_id = ?", input.ReleaseID).
		Assign(record).
		FirstOrCreate(&record).Error; err != nil {
		return nil, err
	}

	return &record, nil
}

func (s *ReleaseService) ListReleases(limit int) ([]model.ReleaseRecord, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var records []model.ReleaseRecord
	err := s.DB.Order("deployed_at DESC, id DESC").Limit(limit).Find(&records).Error
	return records, err
}

func (s *ReleaseService) GetReleaseByID(releaseID string) (*model.ReleaseRecord, error) {
	var record model.ReleaseRecord
	if err := s.DB.Where("release_id = ?", releaseID).First(&record).Error; err != nil {
		return nil, err
	}
	return &record, nil
}

func (s *ReleaseService) RecordRollback(input RecordRollbackInput) (*model.ReleaseRollback, error) {
	if input.FromReleaseID == "" || input.ToReleaseID == "" {
		return nil, errors.New("from_release_id and to_release_id are required")
	}
	if input.Operator == "" {
		input.Operator = "unknown"
	}

	rollback := model.ReleaseRollback{
		FromReleaseID: input.FromReleaseID,
		ToReleaseID:   input.ToReleaseID,
		Operator:      input.Operator,
		Reason:        input.Reason,
	}

	now := time.Now()
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&rollback).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.ReleaseRecord{}).
			Where("release_id = ?", input.FromReleaseID).
			Updates(map[string]interface{}{
				"status":         "rolled_back",
				"rolled_back_at": &now,
			}).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.ReleaseRecord{}).
			Where("release_id = ?", input.ToReleaseID).
			Update("status", "deployed").Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return &rollback, nil
}

func (s *ReleaseService) ListRollbacks(limit int) ([]model.ReleaseRollback, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var rows []model.ReleaseRollback
	err := s.DB.Order("created_at DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}
