package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/Mr9esx/RiSu/server/internal/config"
	"github.com/Mr9esx/RiSu/server/internal/database"
	"github.com/Mr9esx/RiSu/server/internal/service"
)

func main() {
	if len(os.Args) < 2 {
		log.Fatalf("Usage: risu-release-recorder <deploy|rollback> [flags]")
	}

	configPath := os.Getenv("RISU_CONFIG")
	if configPath == "" {
		configPath = "config.yaml"
	}

	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	dbPath := cfg.Database.Path
	if !filepath.IsAbs(dbPath) {
		configDir := filepath.Dir(configPath)
		dbPath = filepath.Clean(filepath.Join(configDir, dbPath))
	}

	db, err := database.Open(dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}

	svc := &service.ReleaseService{DB: db}

	switch os.Args[1] {
	case "deploy":
		runDeploy(svc, os.Args[2:])
	case "rollback":
		runRollback(svc, os.Args[2:])
	default:
		log.Fatalf("Unknown command: %s", os.Args[1])
	}
}

func runDeploy(svc *service.ReleaseService, args []string) {
	fs := flag.NewFlagSet("deploy", flag.ExitOnError)
	releaseID := fs.String("release-id", "", "Release ID")
	branch := fs.String("branch", "release", "Branch name")
	before := fs.String("before-sha", "", "Previous SHA")
	after := fs.String("after-sha", "", "Current SHA")
	artifactPath := fs.String("artifact-path", "", "Artifact path")
	diffFile := fs.String("diff-file", "", "Diff summary file path")
	status := fs.String("status", "deployed", "Release status")
	_ = fs.Parse(args)

	var diffSummary string
	if *diffFile != "" {
		b, err := os.ReadFile(*diffFile)
		if err != nil {
			log.Fatalf("Failed to read diff file: %v", err)
		}
		diffSummary = string(b)
	}

	row, err := svc.UpsertRelease(service.CreateReleaseInput{
		ReleaseID:    *releaseID,
		Branch:       *branch,
		BeforeSHA:    *before,
		AfterSHA:     *after,
		ArtifactPath: *artifactPath,
		DiffSummary:  diffSummary,
		Status:       *status,
		DeployedAt:   time.Now(),
	})
	if err != nil {
		log.Fatalf("Failed to upsert release: %v", err)
	}
	fmt.Printf("Recorded release: %s\n", row.ReleaseID)
}

func runRollback(svc *service.ReleaseService, args []string) {
	fs := flag.NewFlagSet("rollback", flag.ExitOnError)
	fromRelease := fs.String("from-release-id", "", "From release ID")
	toRelease := fs.String("to-release-id", "", "To release ID")
	operator := fs.String("operator", "unknown", "Operator")
	reason := fs.String("reason", "", "Rollback reason")
	_ = fs.Parse(args)

	row, err := svc.RecordRollback(service.RecordRollbackInput{
		FromReleaseID: *fromRelease,
		ToReleaseID:   *toRelease,
		Operator:      *operator,
		Reason:        *reason,
	})
	if err != nil {
		log.Fatalf("Failed to record rollback: %v", err)
	}
	fmt.Printf("Recorded rollback: %d (%s -> %s)\n", row.ID, row.FromReleaseID, row.ToReleaseID)
}
