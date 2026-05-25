package service

import (
	"github.com/Mr9esx/RiSu/server/internal/model"
	"gorm.io/gorm"
)

type ProductService struct {
	DB *gorm.DB
}

func (s *ProductService) List(productType string, publishedOnly bool) ([]model.Product, error) {
	var products []model.Product
	q := s.DB.Order("sort_order ASC, sku ASC")
	if productType != "" {
		q = q.Where("type = ?", productType)
	}
	if publishedOnly {
		q = q.Where("is_published = ?", true)
	}
	return products, q.Find(&products).Error
}

func (s *ProductService) GetBySKU(sku string) (*model.Product, error) {
	var product model.Product
	err := s.DB.Where("sku = ?", sku).First(&product).Error
	if err != nil {
		return nil, err
	}
	return &product, nil
}

func (s *ProductService) Create(product *model.Product) error {
	return s.DB.Transaction(func(tx *gorm.DB) error {
		if product.Type != "block" {
			product.IsDefault = false
		}
		if err := tx.Create(product).Error; err != nil {
			return err
		}
		if product.Type == "block" && product.IsDefault {
			return tx.Model(&model.Product{}).
				Where("type = ? AND sku <> ?", "block", product.SKU).
				Update("is_default", false).Error
		}
		return nil
	})
}

func (s *ProductService) Update(sku string, updates map[string]interface{}) (*model.Product, error) {
	var product model.Product
	if err := s.DB.Where("sku = ?", sku).First(&product).Error; err != nil {
		return nil, err
	}

	err := s.DB.Transaction(func(tx *gorm.DB) error {
		finalType := product.Type
		if typeValue, ok := updates["type"].(string); ok && typeValue != "" {
			finalType = typeValue
		}

		desiredDefault := product.IsDefault
		if isDefaultValue, ok := updates["is_default"].(bool); ok {
			desiredDefault = isDefaultValue
		}

		if finalType != "block" {
			updates["is_default"] = false
			desiredDefault = false
		}

		if err := tx.Model(&product).Updates(updates).Error; err != nil {
			return err
		}

		if finalType == "block" && desiredDefault {
			if err := tx.Model(&model.Product{}).
				Where("type = ? AND sku <> ?", "block", product.SKU).
				Update("is_default", false).Error; err != nil {
				return err
			}
		}

		return tx.Where("sku = ?", sku).First(&product).Error
	})
	if err != nil {
		return nil, err
	}
	return &product, nil
}

func (s *ProductService) Delete(sku string) error {
	return s.DB.Where("sku = ?", sku).Delete(&model.Product{}).Error
}
