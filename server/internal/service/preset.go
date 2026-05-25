package service

import (
	"github.com/Mr9esx/RiSu/server/internal/model"
	"gorm.io/gorm"
)

type PresetService struct {
	DB *gorm.DB
}

func (s *PresetService) List(publishedOnly bool) ([]model.Preset, error) {
	var presets []model.Preset
	q := s.DB.Preload("Items").Order("name ASC")
	if publishedOnly {
		q = q.Where("is_published = ?", true)
	}
	return presets, q.Find(&presets).Error
}

func (s *PresetService) GetByID(id uint) (*model.Preset, error) {
	var preset model.Preset
	if err := s.DB.Preload("Items").First(&preset, id).Error; err != nil {
		return nil, err
	}
	return &preset, nil
}

func (s *PresetService) Create(preset *model.Preset) error {
	return s.DB.Create(preset).Error
}

func (s *PresetService) Update(id uint, preset *model.Preset) error {
	s.DB.Where("preset_id = ?", id).Delete(&model.PresetItem{})

	var existing model.Preset
	if err := s.DB.First(&existing, id).Error; err != nil {
		return err
	}

	existing.Name = preset.Name
	existing.Description = preset.Description
	existing.Image = preset.Image
	existing.BlockSKU = preset.BlockSKU
	existing.IsPublished = preset.IsPublished

	if err := s.DB.Save(&existing).Error; err != nil {
		return err
	}

	for i := range preset.Items {
		preset.Items[i].PresetID = existing.ID
		s.DB.Create(&preset.Items[i])
	}

	return nil
}

func (s *PresetService) Delete(id uint) error {
	s.DB.Where("preset_id = ?", id).Delete(&model.PresetItem{})
	return s.DB.Delete(&model.Preset{}, id).Error
}
