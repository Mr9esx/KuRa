package seeder

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/Mr9esx/RiSu/server/internal/model"
	"gorm.io/gorm"
)

type rawBlock struct {
	SKU                string     `json:"sku"`
	DisplayName        string     `json:"display_name"`
	Name               string     `json:"name"`
	Type               string     `json:"type"`
	Categories         []string   `json:"categories"`
	GridSize           [2]int     `json:"gridSize"`
	Height             int        `json:"height"`
	InnerSize          [2]int     `json:"innerSize"`
	CellGrid           [2]int     `json:"cellGrid"`
	ImagePath          string     `json:"imagePath"`
	ModelPath          string     `json:"modelPath"`
	ModelRotation      [3]float64 `json:"modelRotation"`
	ModelBackHookDepth *int       `json:"modelBackHookDepth"`
}

type rawItem struct {
	SKU           string     `json:"sku"`
	SKUName       string     `json:"sku_name"`
	DisplayName   string     `json:"display_name"`
	Desc          string     `json:"desc"`
	Order         int        `json:"order"`
	Type          string     `json:"type"`
	Categories    []string   `json:"categories"`
	GridSize      [2]int     `json:"gridSize"`
	Height        int        `json:"height"`
	ImagePath     string     `json:"imagePath"`
	ModelPath     string     `json:"modelPath"`
	ModelRotation [3]float64 `json:"modelRotation"`
}

type rawCategoryItem struct {
	Name   string   `json:"name"`
	Order  int      `json:"order"`
	Items  []string `json:"items"`
	Risers []string `json:"risers"`
}

type rawCategoryBlock struct {
	Name   string   `json:"name"`
	Order  int      `json:"order"`
	Blocks []string `json:"blocks"`
}

type rawPreset struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Image       string `json:"image"`
	BlockSKU    string `json:"blockSku"`
	IsPublished *bool  `json:"isPublished"`
	Items       []struct {
		SKU  string `json:"sku"`
		Cell [2]int `json:"cell"`
	} `json:"items"`
}

// SeedIfEmpty checks whether the database has product data.
// If the products table is empty, it imports catalog data from JSON files
// in publishDir and copies model/image assets to dataDir.
func SeedIfEmpty(db *gorm.DB, publishDir, dataDir string) {
	var count int64
	db.Model(&model.Product{}).Count(&count)
	if count > 0 {
		return
	}

	dataPath := filepath.Join(publishDir, "data")
	if _, err := os.Stat(dataPath); os.IsNotExist(err) {
		log.Printf("[seeder] No data directory at %s, skipping auto-seed", dataPath)
		return
	}

	log.Println("[seeder] Database is empty, auto-seeding from JSON files...")

	seedBlocks(db, publishDir)
	seedItems(db, publishDir)
	seedRisers(db, publishDir)
	seedItemCategories(db, publishDir)
	seedBlockCategories(db, publishDir)
	if err := UpsertPresets(db, publishDir); err != nil {
		log.Printf("[seeder] WARN: presets upsert failed: %v", err)
	}
	copyAssets(publishDir, dataDir)

	log.Println("[seeder] Auto-seed complete")
}

func seedBlocks(db *gorm.DB, publishDir string) {
	data, err := os.ReadFile(filepath.Join(publishDir, "data", "blocks.json"))
	if err != nil {
		log.Printf("[seeder] WARN: cannot read blocks.json: %v", err)
		return
	}

	var blocks []rawBlock
	if err := json.Unmarshal(data, &blocks); err != nil {
		log.Printf("[seeder] WARN: cannot parse blocks.json: %v", err)
		return
	}

	for i, b := range blocks {
		innerW := b.InnerSize[0]
		innerD := b.InnerSize[1]
		cellC := b.CellGrid[0]
		cellR := b.CellGrid[1]

		product := model.Product{
			SKU:                b.SKU,
			SKUName:            b.Name,
			DisplayName:        b.DisplayName,
			Type:               "block",
			GridCols:           b.GridSize[0],
			GridRows:           b.GridSize[1],
			Height:             b.Height,
			InnerWidth:         &innerW,
			InnerDepth:         &innerD,
			CellCols:           &cellC,
			CellRows:           &cellR,
			ModelBackHookDepth: b.ModelBackHookDepth,
			ImagePath:          b.ImagePath,
			ModelPath:          b.ModelPath,
			ModelRotationX:     b.ModelRotation[0],
			ModelRotationY:     b.ModelRotation[1],
			ModelRotationZ:     b.ModelRotation[2],
			SortOrder:          i + 1,
			IsPublished:        true,
		}
		if err := db.Create(&product).Error; err != nil {
			log.Printf("[seeder] WARN: block %s: %v", b.SKU, err)
		}
	}
	log.Printf("[seeder] Seeded %d blocks", len(blocks))
}

func seedItems(db *gorm.DB, publishDir string) {
	data, err := os.ReadFile(filepath.Join(publishDir, "data", "items.json"))
	if err != nil {
		log.Printf("[seeder] WARN: cannot read items.json: %v", err)
		return
	}

	var items []rawItem
	if err := json.Unmarshal(data, &items); err != nil {
		log.Printf("[seeder] WARN: cannot parse items.json: %v", err)
		return
	}

	for i, item := range items {
		order := item.Order
		if order == 0 {
			order = i + 1
		}
		product := model.Product{
			SKU:            item.SKU,
			SKUName:        item.SKUName,
			DisplayName:    item.DisplayName,
			Desc:           item.Desc,
			Type:           "item",
			GridCols:       item.GridSize[0],
			GridRows:       item.GridSize[1],
			Height:         item.Height,
			ImagePath:      item.ImagePath,
			ModelPath:      item.ModelPath,
			ModelRotationX: item.ModelRotation[0],
			ModelRotationY: item.ModelRotation[1],
			ModelRotationZ: item.ModelRotation[2],
			SortOrder:      order,
			IsPublished:    true,
		}
		if err := db.Create(&product).Error; err != nil {
			log.Printf("[seeder] WARN: item %s: %v", item.SKU, err)
		}
	}
	log.Printf("[seeder] Seeded %d items", len(items))
}

func seedRisers(db *gorm.DB, publishDir string) {
	data, err := os.ReadFile(filepath.Join(publishDir, "data", "risers.json"))
	if err != nil {
		log.Printf("[seeder] WARN: cannot read risers.json: %v", err)
		return
	}

	var risers []rawItem
	if err := json.Unmarshal(data, &risers); err != nil {
		log.Printf("[seeder] WARN: cannot parse risers.json: %v", err)
		return
	}

	for i, r := range risers {
		order := r.Order
		if order == 0 {
			order = i + 1
		}
		product := model.Product{
			SKU:            r.SKU,
			SKUName:        r.SKUName,
			DisplayName:    r.DisplayName,
			Desc:           r.Desc,
			Type:           "riser",
			GridCols:       r.GridSize[0],
			GridRows:       r.GridSize[1],
			Height:         r.Height,
			ImagePath:      r.ImagePath,
			ModelPath:      r.ModelPath,
			ModelRotationX: r.ModelRotation[0],
			ModelRotationY: r.ModelRotation[1],
			ModelRotationZ: r.ModelRotation[2],
			SortOrder:      order,
			IsPublished:    true,
		}
		if err := db.Create(&product).Error; err != nil {
			log.Printf("[seeder] WARN: riser %s: %v", r.SKU, err)
		}
	}
	log.Printf("[seeder] Seeded %d risers", len(risers))
}

func seedItemCategories(db *gorm.DB, publishDir string) {
	data, err := os.ReadFile(filepath.Join(publishDir, "data", "categories-items.json"))
	if err != nil {
		log.Printf("[seeder] WARN: cannot read categories-items.json: %v", err)
		return
	}

	var categories []rawCategoryItem
	if err := json.Unmarshal(data, &categories); err != nil {
		log.Printf("[seeder] WARN: cannot parse categories-items.json: %v", err)
		return
	}

	for _, cat := range categories {
		category := model.Category{
			Name:      cat.Name,
			Type:      "item",
			SortOrder: cat.Order,
		}
		if err := db.Create(&category).Error; err != nil {
			log.Printf("[seeder] WARN: category %s: %v", cat.Name, err)
			continue
		}

		sortOrder := 1
		for _, sku := range cat.Items {
			db.Create(&model.CategoryProduct{
				CategoryID: category.ID,
				ProductSKU: sku,
				SortOrder:  sortOrder,
			})
			sortOrder++
		}
		for _, sku := range cat.Risers {
			db.Create(&model.CategoryProduct{
				CategoryID: category.ID,
				ProductSKU: sku,
				SortOrder:  sortOrder,
			})
			sortOrder++
		}
	}
	log.Printf("[seeder] Seeded %d item categories", len(categories))
}

func seedBlockCategories(db *gorm.DB, publishDir string) {
	data, err := os.ReadFile(filepath.Join(publishDir, "data", "categories-blocks.json"))
	if err != nil {
		log.Printf("[seeder] WARN: cannot read categories-blocks.json: %v", err)
		return
	}

	var categories []rawCategoryBlock
	if err := json.Unmarshal(data, &categories); err != nil {
		log.Printf("[seeder] WARN: cannot parse categories-blocks.json: %v", err)
		return
	}

	for _, cat := range categories {
		category := model.Category{
			Name:      cat.Name,
			Type:      "block",
			SortOrder: cat.Order,
		}
		if err := db.Create(&category).Error; err != nil {
			log.Printf("[seeder] WARN: category %s: %v", cat.Name, err)
			continue
		}

		for i, sku := range cat.Blocks {
			db.Create(&model.CategoryProduct{
				CategoryID: category.ID,
				ProductSKU: sku,
				SortOrder:  i + 1,
			})
		}
	}
	log.Printf("[seeder] Seeded %d block categories", len(categories))
}

// UpsertPresets reads publishDir/data/presets.json and upserts by preset_id.
// Existing items are replaced. Presets not listed in JSON are left untouched.
func UpsertPresets(db *gorm.DB, publishDir string) error {
	data, err := os.ReadFile(filepath.Join(publishDir, "data", "presets.json"))
	if err != nil {
		return fmt.Errorf("read presets.json: %w", err)
	}

	var presets []rawPreset
	if err := json.Unmarshal(data, &presets); err != nil {
		return fmt.Errorf("parse presets.json: %w", err)
	}

	created, updated := 0, 0
	for _, p := range presets {
		if strings.TrimSpace(p.ID) == "" {
			log.Printf("[seeder] WARN: skip preset with empty id")
			continue
		}

		published := true
		if p.IsPublished != nil {
			published = *p.IsPublished
		}
		image := strings.TrimPrefix(strings.TrimSpace(p.Image), "/")

		err := db.Transaction(func(tx *gorm.DB) error {
			var existing model.Preset
			findErr := tx.Where("preset_id = ?", p.ID).First(&existing).Error
			if findErr != nil && findErr != gorm.ErrRecordNotFound {
				return findErr
			}

			if findErr == gorm.ErrRecordNotFound {
				preset := model.Preset{
					PresetID:    p.ID,
					Name:        p.Name,
					Description: p.Description,
					Image:       image,
					BlockSKU:    p.BlockSKU,
					IsPublished: published,
				}
				if err := tx.Create(&preset).Error; err != nil {
					return err
				}
				for _, item := range p.Items {
					if err := tx.Create(&model.PresetItem{
						PresetID:   preset.ID,
						ProductSKU: item.SKU,
						CellX:      item.Cell[0],
						CellY:      item.Cell[1],
					}).Error; err != nil {
						return err
					}
				}
				created++
				return nil
			}

			existing.Name = p.Name
			existing.Description = p.Description
			existing.Image = image
			existing.BlockSKU = p.BlockSKU
			existing.IsPublished = published
			if err := tx.Save(&existing).Error; err != nil {
				return err
			}
			if err := tx.Where("preset_id = ?", existing.ID).Delete(&model.PresetItem{}).Error; err != nil {
				return err
			}
			for _, item := range p.Items {
				if err := tx.Create(&model.PresetItem{
					PresetID:   existing.ID,
					ProductSKU: item.SKU,
					CellX:      item.Cell[0],
					CellY:      item.Cell[1],
				}).Error; err != nil {
					return err
				}
			}
			updated++
			return nil
		})
		if err != nil {
			log.Printf("[seeder] WARN: preset %s: %v", p.ID, err)
		}
	}

	log.Printf("[seeder] Upserted presets: created=%d updated=%d total=%d", created, updated, len(presets))
	return nil
}

// SyncPresetAssets copies preset cover images from publishDir into dataDir.
func SyncPresetAssets(publishDir, dataDir string) error {
	src := filepath.Join(publishDir, "images", "presets")
	dst := filepath.Join(dataDir, "images", "presets")
	if _, err := os.Stat(src); os.IsNotExist(err) {
		log.Printf("[seeder] No preset images at %s, skip asset sync", src)
		return nil
	}
	copied, err := copyTree(src, dst)
	if err != nil {
		return err
	}
	log.Printf("[seeder] Synced %d preset image files to data directory", copied)
	return nil
}

func copyAssets(publishDir, dataDir string) {
	dirs := []struct{ src, dst string }{
		{filepath.Join(publishDir, "models"), filepath.Join(dataDir, "models")},
		{filepath.Join(publishDir, "images", "block"), filepath.Join(dataDir, "images", "block")},
		{filepath.Join(publishDir, "images", "items"), filepath.Join(dataDir, "images", "items")},
		{filepath.Join(publishDir, "images", "presets"), filepath.Join(dataDir, "images", "presets")},
	}

	total := 0
	for _, d := range dirs {
		n, err := copyTree(d.src, d.dst)
		if err != nil {
			log.Printf("[seeder] WARN: copy %s: %v", d.src, err)
			continue
		}
		total += n
	}
	log.Printf("[seeder] Copied %d asset files to data directory", total)
}

func copyTree(src, dst string) (int, error) {
	if _, err := os.Stat(src); os.IsNotExist(err) {
		return 0, nil
	}
	copied := 0
	err := filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		relPath, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		dstPath := filepath.Join(dst, relPath)
		if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
			return err
		}
		if err := copyFile(path, dstPath); err != nil {
			return fmt.Errorf("copy %s -> %s: %w", path, dstPath, err)
		}
		copied++
		return nil
	})
	return copied, err
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}
