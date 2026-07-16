package publisher

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/Mr9esx/RiSu/server/internal/model"
	"gorm.io/gorm"
)

type Publisher struct {
	DB         *gorm.DB
	DataDir    string
	PublishDir string
}

type PublishResult struct {
	FilesCopied   int       `json:"files_copied"`
	FilesDeleted  int       `json:"files_deleted"`
	PublishedAt   time.Time `json:"published_at"`
	FilesToCopy   []string  `json:"files_to_copy,omitempty"`
	FilesToDelete []string  `json:"files_to_delete,omitempty"`
	DiffSummary   string    `json:"diff_summary,omitempty"`
	Snapshot      string    `json:"-"`
}

type PublishPreview struct {
	FilesToCopy      []string  `json:"files_to_copy"`
	FilesToDelete    []string  `json:"files_to_delete"`
	DataChanges      []string  `json:"data_changes,omitempty"`
	DataFieldChanges []string  `json:"data_field_changes,omitempty"`
	GeneratedAt      time.Time `json:"generated_at"`
	DiffSummary      string    `json:"diff_summary"`
	Snapshot         string    `json:"-"`
}

func (p *Publisher) Publish() (*PublishResult, error) {
	preview, err := p.Preview()
	if err != nil {
		return nil, err
	}

	result := &PublishResult{
		PublishedAt:   time.Now(),
		FilesToCopy:   preview.FilesToCopy,
		FilesToDelete: preview.FilesToDelete,
		DiffSummary:   preview.DiffSummary,
		Snapshot:      preview.Snapshot,
	}

	for _, relPath := range preview.FilesToCopy {
		srcPath := filepath.Join(p.DataDir, relPath)
		dstPath := filepath.Join(p.PublishDir, relPath)
		if err := os.MkdirAll(filepath.Dir(dstPath), 0o755); err != nil {
			return nil, fmt.Errorf("failed to create dir for %s: %w", relPath, err)
		}
		if err := copyFile(srcPath, dstPath); err != nil {
			return nil, fmt.Errorf("failed to copy %s: %w", relPath, err)
		}
		result.FilesCopied++
	}

	for _, relPath := range preview.FilesToDelete {
		fullPath := filepath.Join(p.PublishDir, relPath)
		if err := os.Remove(fullPath); err == nil {
			result.FilesDeleted++
		}
	}

	return result, nil
}

func (p *Publisher) Preview() (*PublishPreview, error) {
	referencedFiles, err := p.collectReferencedFiles()
	if err != nil {
		return nil, err
	}

	filesToCopy := make([]string, 0, len(referencedFiles))
	for relPath := range referencedFiles {
		srcPath := filepath.Join(p.DataDir, relPath)
		if _, statErr := os.Stat(srcPath); os.IsNotExist(statErr) {
			continue
		}
		filesToCopy = append(filesToCopy, relPath)
	}
	sort.Strings(filesToCopy)

	filesToDelete, err := p.collectOrphanedFiles(referencedFiles)
	if err != nil {
		return nil, err
	}
	sort.Strings(filesToDelete)

	currentSnapshot, snapshotJSON, err := p.buildCurrentSnapshot()
	if err != nil {
		return nil, err
	}
	baseSnapshot, err := p.loadLatestSnapshot()
	if err != nil {
		return nil, err
	}
	dataChanges, dataFieldChanges := diffSnapshotsDetailed(baseSnapshot, currentSnapshot)
	sort.Strings(dataChanges)
	sort.Strings(dataFieldChanges)

	generatedAt := time.Now()
	return &PublishPreview{
		FilesToCopy:      filesToCopy,
		FilesToDelete:    filesToDelete,
		DataChanges:      dataChanges,
		DataFieldChanges: dataFieldChanges,
		GeneratedAt:      generatedAt,
		DiffSummary:      buildDiffSummary(filesToCopy, filesToDelete, dataChanges, dataFieldChanges, generatedAt),
		Snapshot:         snapshotJSON,
	}, nil
}

func (p *Publisher) loadLatestSnapshot() (map[string]string, error) {
	var record model.ReleaseRecord
	err := p.DB.
		Where("status = ? AND data_snapshot <> ''", "deployed").
		Order("deployed_at DESC, id DESC").
		First(&record).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return map[string]string{}, nil
		}
		return nil, fmt.Errorf("failed to load latest snapshot: %w", err)
	}
	return decodeSnapshot(record.DataSnapshot)
}

func (p *Publisher) buildCurrentSnapshot() (map[string]string, string, error) {
	snapshot := make(map[string]string)

	type productSnapshot struct {
		SKU                string  `json:"sku"`
		SKUName            string  `json:"sku_name"`
		DisplayName        string  `json:"display_name"`
		Desc               string  `json:"desc"`
		Type               string  `json:"type"`
		GridCols           int     `json:"grid_cols"`
		GridRows           int     `json:"grid_rows"`
		Height             int     `json:"height"`
		InnerWidth         *int    `json:"inner_width"`
		InnerDepth         *int    `json:"inner_depth"`
		CellCols           *int    `json:"cell_cols"`
		CellRows           *int    `json:"cell_rows"`
		ModelBackHookDepth *int    `json:"model_back_hook_depth"`
		ImagePath          string  `json:"image_path"`
		ModelPath          string  `json:"model_path"`
		ModelRotationX     float64 `json:"model_rotation_x"`
		ModelRotationY     float64 `json:"model_rotation_y"`
		ModelRotationZ     float64 `json:"model_rotation_z"`
		SortOrder          int     `json:"sort_order"`
		IsPublished        bool    `json:"is_published"`
	}

	var products []model.Product
	if err := p.DB.Where("is_published = ?", true).Order("sku ASC").Find(&products).Error; err != nil {
		return nil, "", fmt.Errorf("failed to query products snapshot: %w", err)
	}
	for _, prod := range products {
		key := fmt.Sprintf("data/products/%s", prod.SKU)
		payload := productSnapshot{
			SKU:                prod.SKU,
			SKUName:            prod.SKUName,
			DisplayName:        prod.DisplayName,
			Desc:               prod.Desc,
			Type:               prod.Type,
			GridCols:           prod.GridCols,
			GridRows:           prod.GridRows,
			Height:             prod.Height,
			InnerWidth:         prod.InnerWidth,
			InnerDepth:         prod.InnerDepth,
			CellCols:           prod.CellCols,
			CellRows:           prod.CellRows,
			ModelBackHookDepth: prod.ModelBackHookDepth,
			ImagePath:          prod.ImagePath,
			ModelPath:          prod.ModelPath,
			ModelRotationX:     prod.ModelRotationX,
			ModelRotationY:     prod.ModelRotationY,
			ModelRotationZ:     prod.ModelRotationZ,
			SortOrder:          prod.SortOrder,
			IsPublished:        prod.IsPublished,
		}
		raw, err := json.Marshal(payload)
		if err != nil {
			return nil, "", fmt.Errorf("failed to marshal product snapshot: %w", err)
		}
		snapshot[key] = string(raw)
	}

	type categoryLink struct {
		ProductSKU string `json:"product_sku"`
		SortOrder  int    `json:"sort_order"`
	}
	type categorySnapshot struct {
		ID        uint           `json:"id"`
		Name      string         `json:"name"`
		Type      string         `json:"type"`
		SortOrder int            `json:"sort_order"`
		Products  []categoryLink `json:"products"`
	}

	var categories []model.Category
	if err := p.DB.Order("id ASC").Find(&categories).Error; err != nil {
		return nil, "", fmt.Errorf("failed to query categories snapshot: %w", err)
	}
	categoryIDs := make([]uint, 0, len(categories))
	for _, cat := range categories {
		categoryIDs = append(categoryIDs, cat.ID)
	}
	var links []model.CategoryProduct
	if len(categoryIDs) > 0 {
		if err := p.DB.Where("category_id IN ?", categoryIDs).Order("category_id ASC, sort_order ASC, product_sku ASC, id ASC").Find(&links).Error; err != nil {
			return nil, "", fmt.Errorf("failed to query category links snapshot: %w", err)
		}
	}
	productsByCategory := make(map[uint][]categoryLink)
	for _, link := range links {
		productsByCategory[link.CategoryID] = append(productsByCategory[link.CategoryID], categoryLink{
			ProductSKU: link.ProductSKU,
			SortOrder:  link.SortOrder,
		})
	}
	for _, cat := range categories {
		key := fmt.Sprintf("data/categories/%d", cat.ID)
		payload := categorySnapshot{
			ID:        cat.ID,
			Name:      cat.Name,
			Type:      cat.Type,
			SortOrder: cat.SortOrder,
			Products:  productsByCategory[cat.ID],
		}
		raw, err := json.Marshal(payload)
		if err != nil {
			return nil, "", fmt.Errorf("failed to marshal category snapshot: %w", err)
		}
		snapshot[key] = string(raw)
	}

	type presetItemSnapshot struct {
		ProductSKU string `json:"product_sku"`
		CellX      int    `json:"cell_x"`
		CellY      int    `json:"cell_y"`
	}
	type presetSnapshot struct {
		PresetID    string               `json:"preset_id"`
		Name        string               `json:"name"`
		Description string               `json:"description"`
		Image       string               `json:"image"`
		BlockSKU    string               `json:"block_sku"`
		IsPublished bool                 `json:"is_published"`
		Items       []presetItemSnapshot `json:"items"`
	}

	var presets []model.Preset
	if err := p.DB.
		Where("is_published = ?", true).
		Preload("Items", func(tx *gorm.DB) *gorm.DB {
			return tx.Order("product_sku ASC, cell_x ASC, cell_y ASC, id ASC")
		}).
		Order("preset_id ASC").
		Find(&presets).Error; err != nil {
		return nil, "", fmt.Errorf("failed to query presets snapshot: %w", err)
	}
	for _, preset := range presets {
		items := make([]presetItemSnapshot, 0, len(preset.Items))
		for _, item := range preset.Items {
			items = append(items, presetItemSnapshot{
				ProductSKU: item.ProductSKU,
				CellX:      item.CellX,
				CellY:      item.CellY,
			})
		}
		key := fmt.Sprintf("data/presets/%s", preset.PresetID)
		payload := presetSnapshot{
			PresetID:    preset.PresetID,
			Name:        preset.Name,
			Description: preset.Description,
			Image:       preset.Image,
			BlockSKU:    preset.BlockSKU,
			IsPublished: preset.IsPublished,
			Items:       items,
		}
		raw, err := json.Marshal(payload)
		if err != nil {
			return nil, "", fmt.Errorf("failed to marshal preset snapshot: %w", err)
		}
		snapshot[key] = string(raw)
	}

	snapshotJSON, err := encodeSnapshot(snapshot)
	if err != nil {
		return nil, "", err
	}
	return snapshot, snapshotJSON, nil
}

func diffSnapshotsDetailed(base map[string]string, current map[string]string) ([]string, []string) {
	rowChanges := make([]string, 0)
	fieldChanges := make([]string, 0)
	for key, curr := range current {
		prev, ok := base[key]
		if !ok {
			rowChanges = append(rowChanges, "A\t"+key)
			continue
		}
		if prev != curr {
			rowChanges = append(rowChanges, "M\t"+key)
			fieldChanges = append(fieldChanges, diffEntityFields(key, prev, curr)...)
		}
	}
	for key := range base {
		if _, ok := current[key]; !ok {
			rowChanges = append(rowChanges, "D\t"+key)
		}
	}
	return rowChanges, fieldChanges
}

func diffEntityFields(entityKey string, beforeJSON string, afterJSON string) []string {
	beforeFlat := flattenJSONFields(beforeJSON)
	afterFlat := flattenJSONFields(afterJSON)
	paths := make([]string, 0, len(beforeFlat)+len(afterFlat))
	seen := make(map[string]struct{})
	for k := range beforeFlat {
		seen[k] = struct{}{}
	}
	for k := range afterFlat {
		seen[k] = struct{}{}
	}
	for k := range seen {
		paths = append(paths, k)
	}
	sort.Strings(paths)

	changes := make([]string, 0)
	for _, path := range paths {
		beforeValue, beforeOK := beforeFlat[path]
		afterValue, afterOK := afterFlat[path]
		switch {
		case !beforeOK && afterOK:
			changes = append(changes, fmt.Sprintf("A\t%s\t%s = %s", entityKey, path, afterValue))
		case beforeOK && !afterOK:
			changes = append(changes, fmt.Sprintf("D\t%s\t%s (was %s)", entityKey, path, beforeValue))
		case beforeOK && afterOK && beforeValue != afterValue:
			changes = append(changes, fmt.Sprintf("M\t%s\t%s: %s -> %s", entityKey, path, beforeValue, afterValue))
		}
	}
	return changes
}

func flattenJSONFields(raw string) map[string]string {
	result := make(map[string]string)
	if strings.TrimSpace(raw) == "" {
		return result
	}
	var value interface{}
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		result["$"] = raw
		return result
	}
	flattenValue("$", value, result)
	return result
}

func flattenValue(path string, value interface{}, out map[string]string) {
	switch v := value.(type) {
	case map[string]interface{}:
		keys := make([]string, 0, len(v))
		for k := range v {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			nextPath := path + "." + k
			flattenValue(nextPath, v[k], out)
		}
	case []interface{}:
		for idx, item := range v {
			nextPath := fmt.Sprintf("%s[%d]", path, idx)
			flattenValue(nextPath, item, out)
		}
	default:
		encoded, err := json.Marshal(v)
		if err != nil {
			out[path] = fmt.Sprintf("%v", v)
			return
		}
		out[path] = string(encoded)
	}
}

func encodeSnapshot(snapshot map[string]string) (string, error) {
	raw, err := json.Marshal(snapshot)
	if err != nil {
		return "", fmt.Errorf("failed to encode snapshot: %w", err)
	}
	return string(raw), nil
}

func decodeSnapshot(snapshotJSON string) (map[string]string, error) {
	if strings.TrimSpace(snapshotJSON) == "" {
		return map[string]string{}, nil
	}
	var snapshot map[string]string
	if err := json.Unmarshal([]byte(snapshotJSON), &snapshot); err != nil {
		return nil, fmt.Errorf("failed to decode snapshot: %w", err)
	}
	if snapshot == nil {
		return map[string]string{}, nil
	}
	return snapshot, nil
}

func (p *Publisher) collectReferencedFiles() (map[string]bool, error) {
	var products []model.Product
	if err := p.DB.Where("is_published = ?", true).Find(&products).Error; err != nil {
		return nil, fmt.Errorf("failed to query products: %w", err)
	}

	referencedFiles := make(map[string]bool)
	addRef := func(path string) {
		rel := filepath.ToSlash(strings.TrimPrefix(strings.TrimSpace(path), "/"))
		if rel != "" {
			referencedFiles[rel] = true
		}
	}

	for _, prod := range products {
		addRef(prod.ModelPath)
		addRef(prod.ImagePath)
	}

	var presets []model.Preset
	if err := p.DB.Where("is_published = ?", true).Find(&presets).Error; err != nil {
		return nil, fmt.Errorf("failed to query presets: %w", err)
	}
	for _, preset := range presets {
		addRef(preset.Image)
	}

	return referencedFiles, nil
}

func (p *Publisher) collectOrphanedFiles(referenced map[string]bool) ([]string, error) {
	dirs := []string{"images", "models"}
	deletions := make([]string, 0)

	for _, dir := range dirs {
		publishSubDir := filepath.Join(p.PublishDir, dir)
		if _, err := os.Stat(publishSubDir); os.IsNotExist(err) {
			continue
		}

		err := filepath.Walk(publishSubDir, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return err
			}

			relPath, _ := filepath.Rel(p.PublishDir, path)
			relPath = filepath.ToSlash(relPath)
			if !referenced[relPath] {
				deletions = append(deletions, relPath)
			}
			return nil
		})
		if err != nil {
			return deletions, err
		}
	}

	return deletions, nil
}

func buildDiffSummary(filesToCopy []string, filesToDelete []string, dataChanges []string, dataFieldChanges []string, generatedAt time.Time) string {
	dataAdded, dataModified, dataDeleted := 0, 0, 0
	for _, row := range dataChanges {
		switch {
		case strings.HasPrefix(row, "A\t"):
			dataAdded++
		case strings.HasPrefix(row, "M\t"):
			dataModified++
		case strings.HasPrefix(row, "D\t"):
			dataDeleted++
		}
	}

	var b bytes.Buffer
	b.WriteString(fmt.Sprintf("Generated At: %s\n", generatedAt.Format(time.RFC3339)))
	b.WriteString(fmt.Sprintf("Copied Files: %d\n", len(filesToCopy)))
	b.WriteString(fmt.Sprintf("Deleted Files: %d\n", len(filesToDelete)))
	b.WriteString(fmt.Sprintf("Changed Data Rows: %d\n", len(dataChanges)))
	b.WriteString(fmt.Sprintf("Changed Data Fields: %d\n", len(dataFieldChanges)))
	b.WriteString(fmt.Sprintf("Data Added: %d\n", dataAdded))
	b.WriteString(fmt.Sprintf("Data Modified: %d\n", dataModified))
	b.WriteString(fmt.Sprintf("Data Deleted: %d\n", dataDeleted))
	b.WriteString("\n")
	b.WriteString("## File Diff (name-status)\n")
	if len(filesToCopy) == 0 && len(filesToDelete) == 0 {
		b.WriteString("No file changes.\n")
	} else {
		for _, rel := range filesToCopy {
			b.WriteString("A\t")
			b.WriteString(rel)
			b.WriteString("\n")
		}
		for _, rel := range filesToDelete {
			b.WriteString("D\t")
			b.WriteString(rel)
			b.WriteString("\n")
		}
	}

	b.WriteString("\n## Data Diff (name-status)\n")
	if len(dataChanges) == 0 {
		b.WriteString("No data changes.\n")
	} else {
		for _, row := range dataChanges {
			b.WriteString(row)
			b.WriteString("\n")
		}
	}

	b.WriteString("\n## Data Field Diff\n")
	if len(dataFieldChanges) == 0 {
		b.WriteString("No field-level changes.\n")
	} else {
		for _, row := range dataFieldChanges {
			b.WriteString(row)
			b.WriteString("\n")
		}
	}

	b.WriteString("\n## File Diff (stat)\n")
	if len(filesToCopy) > 0 {
		b.WriteString(fmt.Sprintf("%d files added\n", len(filesToCopy)))
	}
	if len(filesToDelete) > 0 {
		b.WriteString(fmt.Sprintf("%d files deleted\n", len(filesToDelete)))
	}
	if len(dataChanges) > 0 {
		b.WriteString(fmt.Sprintf("%d data rows modified\n", len(dataChanges)))
		b.WriteString(fmt.Sprintf("%d data rows added\n", dataAdded))
		b.WriteString(fmt.Sprintf("%d data rows changed\n", dataModified))
		b.WriteString(fmt.Sprintf("%d data rows deleted\n", dataDeleted))
	}
	if len(dataFieldChanges) > 0 {
		b.WriteString(fmt.Sprintf("%d data fields changed\n", len(dataFieldChanges)))
	}
	if len(filesToCopy) == 0 && len(filesToDelete) == 0 && len(dataChanges) == 0 {
		b.WriteString("No file changes.\n")
	}
	return strings.TrimSpace(b.String())
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
