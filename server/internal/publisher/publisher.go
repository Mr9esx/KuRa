package publisher

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
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
	FilesCopied  int       `json:"files_copied"`
	FilesDeleted int       `json:"files_deleted"`
	PublishedAt  time.Time `json:"published_at"`
}

func (p *Publisher) Publish() (*PublishResult, error) {
	result := &PublishResult{PublishedAt: time.Now()}

	var products []model.Product
	if err := p.DB.Where("is_published = ?", true).Find(&products).Error; err != nil {
		return nil, fmt.Errorf("failed to query products: %w", err)
	}

	referencedFiles := make(map[string]bool)
	for _, prod := range products {
		if prod.ModelPath != "" {
			referencedFiles[prod.ModelPath] = true
		}
		if prod.ImagePath != "" {
			referencedFiles[prod.ImagePath] = true
		}
	}

	for path := range referencedFiles {
		srcPath := filepath.Join(p.DataDir, path)
		dstPath := filepath.Join(p.PublishDir, path)

		if _, err := os.Stat(srcPath); os.IsNotExist(err) {
			continue
		}

		if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
			return nil, fmt.Errorf("failed to create dir for %s: %w", path, err)
		}

		if err := copyFile(srcPath, dstPath); err != nil {
			return nil, fmt.Errorf("failed to copy %s: %w", path, err)
		}
		result.FilesCopied++
	}

	deleted, err := p.cleanOrphanedFiles(referencedFiles)
	if err != nil {
		return nil, fmt.Errorf("failed to clean orphaned files: %w", err)
	}
	result.FilesDeleted = deleted

	return result, nil
}

func (p *Publisher) cleanOrphanedFiles(referenced map[string]bool) (int, error) {
	deleted := 0
	dirs := []string{"images", "models"}

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
			if !referenced[relPath] {
				if err := os.Remove(path); err == nil {
					deleted++
				}
			}
			return nil
		})
		if err != nil {
			return deleted, err
		}
	}

	return deleted, nil
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
