-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('LOCAL', 'ENTRA_ID');

-- CreateEnum
CREATE TYPE "ExternalSource" AS ENUM ('PHIDIAS');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'ENROLLED', 'ADMITTED', 'PENDING', 'SUSPENDED', 'WITHDRAWN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('es', 'de', 'en');

-- CreateEnum
CREATE TYPE "AssessmentAudience" AS ENUM ('STUDENT', 'TEACHER');

-- CreateEnum
CREATE TYPE "AssessmentPurpose" AS ENUM ('EVALUATION', 'TRAINING', 'DIAGNOSTIC');

-- CreateEnum
CREATE TYPE "AssessmentVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('BASIC', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'OPEN_TEXT', 'FILL_BLANK', 'MATCHING', 'GROUPING', 'TIMELINE', 'ORDERING', 'IMAGE_CHOICE', 'HOTSPOT', 'SHORT_ANSWER', 'LONG_ANSWER');

-- CreateEnum
CREATE TYPE "AssignmentTargetType" AS ENUM ('USER', 'GROUP');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('SCHEDULED', 'OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'PENDING_REVIEW', 'GRADED', 'EXPIRED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ScaleKind" AS ENUM ('BANDED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "TrainingContentType" AS ENUM ('TEXT', 'VIDEO', 'DOCUMENT', 'LINK', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "TrainingProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AiGenerationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'VALIDATED', 'APPLIED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('STUDENTS', 'ACADEMIC_YEARS', 'PERIODS', 'GROUPS');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "password_hash" TEXT,
    "password_updated_at" TIMESTAMP(3),
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "preferred_language" "Language" NOT NULL DEFAULT 'es',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_identities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "email" TEXT,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" TEXT,
    "ip_address" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" TEXT NOT NULL,
    "external_id" INTEGER,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_periods" (
    "id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "external_id" INTEGER,
    "external_category_id" INTEGER,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "education_levels" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "education_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_levels" (
    "id" TEXT NOT NULL,
    "education_level_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "ordinal" INTEGER,
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_areas" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "academic_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "grade_level_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "homeroom_teacher_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "external_source" "ExternalSource",
    "external_id" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_memberships" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "external_source" "ExternalSource",
    "external_id" INTEGER,
    "code" TEXT,
    "grade_level_id" TEXT,
    "enrollment_status" "EnrollmentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "raw_enrollment_status" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "employee_code" TEXT,
    "hire_date" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_areas" (
    "teacher_id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "teacher_areas_pkey" PRIMARY KEY ("teacher_id","area_id")
);

-- CreateTable
CREATE TABLE "teacher_subjects" (
    "teacher_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,

    CONSTRAINT "teacher_subjects_pkey" PRIMARY KEY ("teacher_id","subject_id")
);

-- CreateTable
CREATE TABLE "kmk_competencies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT,
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kmk_competencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kmk_subcompetencies" (
    "id" TEXT NOT NULL,
    "competency_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kmk_subcompetencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kmk_indicators" (
    "id" TEXT NOT NULL,
    "subcompetency_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kmk_indicators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_scales" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" JSONB NOT NULL,
    "audience" "AssessmentAudience" NOT NULL,
    "kind" "ScaleKind" NOT NULL,
    "passing_percentage" DECIMAL(5,2) NOT NULL,
    "lower_is_better" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grading_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_scale_bands" (
    "id" TEXT NOT NULL,
    "scale_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "value" DECIMAL(4,2) NOT NULL,
    "min_percentage" DECIMAL(5,2) NOT NULL,
    "label" JSONB NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "grading_scale_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "audience" "AssessmentAudience" NOT NULL,
    "purpose" "AssessmentPurpose" NOT NULL DEFAULT 'EVALUATION',
    "subject_id" TEXT,
    "area_id" TEXT,
    "grade_level_id" TEXT,
    "language" "Language" NOT NULL DEFAULT 'es',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_versions" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "AssessmentVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'INTERMEDIATE',
    "language" "Language" NOT NULL DEFAULT 'es',
    "time_limit_minutes" INTEGER,
    "passing_percentage" DECIMAL(5,2),
    "grading_scale_id" TEXT,
    "show_results_immediately" BOOLEAN NOT NULL DEFAULT true,
    "show_correct_answers" BOOLEAN NOT NULL DEFAULT true,
    "show_feedback" BOOLEAN NOT NULL DEFAULT true,
    "shuffle_questions" BOOLEAN NOT NULL DEFAULT false,
    "shuffle_options" BOOLEAN NOT NULL DEFAULT false,
    "total_points" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "question_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "published_by_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "assessment_version_id" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "statement" TEXT NOT NULL,
    "instructions" TEXT,
    "points" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'INTERMEDIATE',
    "kmk_competency_id" TEXT NOT NULL,
    "kmk_subcompetency_id" TEXT,
    "feedback_correct" TEXT,
    "feedback_incorrect" TEXT,
    "explanation" TEXT,
    "payload" JSONB NOT NULL,
    "media_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "assessment_version_id" TEXT NOT NULL,
    "assigned_by_id" TEXT NOT NULL,
    "target_type" "AssignmentTargetType" NOT NULL,
    "group_id" TEXT,
    "plan_item_id" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3),
    "attempts_allowed" INTEGER NOT NULL DEFAULT 1,
    "time_limit_minutes" INTEGER,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_recipients" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "attempts_used" INTEGER NOT NULL DEFAULT 0,
    "best_percentage" DECIMAL(5,2),
    "last_activity_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_attempts" (
    "id" TEXT NOT NULL,
    "assignment_recipient_id" TEXT NOT NULL,
    "assessment_version_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "graded_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "points_earned" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "points_possible" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "grading_scale_id" TEXT,
    "grade_value" DECIMAL(4,2),
    "grade_label" JSONB,
    "passing_percentage" DECIMAL(5,2),
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "stars_filled" INTEGER,
    "stars_total" INTEGER,
    "requires_manual_grading" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_answers" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "response" JSONB,
    "is_correct" BOOLEAN,
    "points_earned" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "points_possible" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "auto_graded" BOOLEAN NOT NULL DEFAULT false,
    "requires_manual_grading" BOOLEAN NOT NULL DEFAULT false,
    "teacher_feedback" TEXT,
    "graded_by_id" TEXT,
    "graded_at" TIMESTAMP(3),
    "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "question_type" "QuestionType" NOT NULL,
    "kmk_competency_id" TEXT NOT NULL,
    "kmk_subcompetency_id" TEXT,
    "subject_id" TEXT,
    "group_id" TEXT,
    "academic_period_id" TEXT,

    CONSTRAINT "attempt_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_plans" (
    "id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "grade_level_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_by_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "evaluation_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_plan_items" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "academic_period_id" TEXT NOT NULL,
    "assessment_id" TEXT,
    "kmk_competency_id" TEXT,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "due_at" TIMESTAMP(3),
    "required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_modules" (
    "id" TEXT NOT NULL,
    "kmk_competency_id" TEXT NOT NULL,
    "assessment_id" TEXT,
    "code" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "position" INTEGER NOT NULL,
    "estimated_minutes" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_contents" (
    "id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "type" "TrainingContentType" NOT NULL,
    "title" JSONB NOT NULL,
    "body" JSONB,
    "url" TEXT,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_progress" (
    "id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "TrainingProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "contents_seen" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "last_access_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generation_requests" (
    "id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "status" "AiGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "raw_response" JSONB,
    "validation_errors" JSONB,
    "assessment_version_id" TEXT,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "duration_ms" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ai_generation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phidias_sync_logs" (
    "id" TEXT NOT NULL,
    "sync_type" "SyncType" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "deactivated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "issues" JSONB,
    "error_message" TEXT,
    "triggered_by_id" TEXT,

    CONSTRAINT "phidias_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "body" JSONB,
    "data" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "user_identities_user_id_idx" ON "user_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_provider_provider_user_id_key" ON "user_identities"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens"("family");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_resource_idx" ON "permissions"("resource");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_code_key" ON "academic_years"("code");

-- CreateIndex
CREATE INDEX "academic_years_is_current_idx" ON "academic_years"("is_current");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_external_id_key" ON "academic_years"("external_id");

-- CreateIndex
CREATE INDEX "academic_periods_academic_year_id_position_idx" ON "academic_periods"("academic_year_id", "position");

-- CreateIndex
CREATE INDEX "academic_periods_start_date_end_date_idx" ON "academic_periods"("start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "academic_periods_external_id_key" ON "academic_periods"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "education_levels_code_key" ON "education_levels"("code");

-- CreateIndex
CREATE UNIQUE INDEX "grade_levels_code_key" ON "grade_levels"("code");

-- CreateIndex
CREATE INDEX "grade_levels_education_level_id_position_idx" ON "grade_levels"("education_level_id", "position");

-- CreateIndex
CREATE INDEX "academic_areas_active_idx" ON "academic_areas"("active");

-- CreateIndex
CREATE UNIQUE INDEX "academic_areas_code_key" ON "academic_areas"("code");

-- CreateIndex
CREATE INDEX "subjects_area_id_active_idx" ON "subjects"("area_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");

-- CreateIndex
CREATE INDEX "groups_academic_year_id_active_idx" ON "groups"("academic_year_id", "active");

-- CreateIndex
CREATE INDEX "groups_grade_level_id_idx" ON "groups"("grade_level_id");

-- CreateIndex
CREATE INDEX "groups_homeroom_teacher_id_idx" ON "groups"("homeroom_teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "groups_academic_year_id_code_key" ON "groups"("academic_year_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "groups_external_source_external_id_academic_year_id_key" ON "groups"("external_source", "external_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "group_memberships_student_id_active_idx" ON "group_memberships"("student_id", "active");

-- CreateIndex
CREATE INDEX "group_memberships_group_id_active_idx" ON "group_memberships"("group_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "group_memberships_group_id_student_id_key" ON "group_memberships"("group_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE INDEX "students_enrollment_status_idx" ON "students"("enrollment_status");

-- CreateIndex
CREATE INDEX "students_grade_level_id_idx" ON "students"("grade_level_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_external_source_external_id_key" ON "students"("external_source", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_user_id_key" ON "teachers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_employee_code_key" ON "teachers"("employee_code");

-- CreateIndex
CREATE INDEX "teachers_active_idx" ON "teachers"("active");

-- CreateIndex
CREATE INDEX "teacher_areas_area_id_idx" ON "teacher_areas"("area_id");

-- CreateIndex
CREATE INDEX "teacher_subjects_subject_id_idx" ON "teacher_subjects"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "kmk_competencies_code_key" ON "kmk_competencies"("code");

-- CreateIndex
CREATE INDEX "kmk_competencies_position_idx" ON "kmk_competencies"("position");

-- CreateIndex
CREATE UNIQUE INDEX "kmk_subcompetencies_code_key" ON "kmk_subcompetencies"("code");

-- CreateIndex
CREATE INDEX "kmk_subcompetencies_competency_id_position_idx" ON "kmk_subcompetencies"("competency_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "kmk_indicators_code_key" ON "kmk_indicators"("code");

-- CreateIndex
CREATE INDEX "kmk_indicators_subcompetency_id_position_idx" ON "kmk_indicators"("subcompetency_id", "position");

-- CreateIndex
CREATE INDEX "grading_scales_audience_is_active_idx" ON "grading_scales"("audience", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "grading_scales_code_version_key" ON "grading_scales"("code", "version");

-- CreateIndex
CREATE INDEX "grading_scale_bands_scale_id_min_percentage_idx" ON "grading_scale_bands"("scale_id", "min_percentage");

-- CreateIndex
CREATE UNIQUE INDEX "grading_scale_bands_scale_id_position_key" ON "grading_scale_bands"("scale_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "grading_scale_bands_scale_id_value_key" ON "grading_scale_bands"("scale_id", "value");

-- CreateIndex
CREATE INDEX "assessments_created_by_id_deleted_at_idx" ON "assessments"("created_by_id", "deleted_at");

-- CreateIndex
CREATE INDEX "assessments_audience_purpose_idx" ON "assessments"("audience", "purpose");

-- CreateIndex
CREATE INDEX "assessments_subject_id_idx" ON "assessments"("subject_id");

-- CreateIndex
CREATE INDEX "assessment_versions_assessment_id_status_idx" ON "assessment_versions"("assessment_id", "status");

-- CreateIndex
CREATE INDEX "assessment_versions_status_idx" ON "assessment_versions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_versions_assessment_id_version_number_key" ON "assessment_versions"("assessment_id", "version_number");

-- CreateIndex
CREATE INDEX "questions_assessment_version_id_idx" ON "questions"("assessment_version_id");

-- CreateIndex
CREATE INDEX "questions_kmk_competency_id_idx" ON "questions"("kmk_competency_id");

-- CreateIndex
CREATE INDEX "questions_type_idx" ON "questions"("type");

-- CreateIndex
CREATE UNIQUE INDEX "questions_assessment_version_id_position_key" ON "questions"("assessment_version_id", "position");

-- CreateIndex
CREATE INDEX "assignments_assessment_version_id_idx" ON "assignments"("assessment_version_id");

-- CreateIndex
CREATE INDEX "assignments_group_id_status_idx" ON "assignments"("group_id", "status");

-- CreateIndex
CREATE INDEX "assignments_assigned_by_id_idx" ON "assignments"("assigned_by_id");

-- CreateIndex
CREATE INDEX "assignments_start_at_end_at_idx" ON "assignments"("start_at", "end_at");

-- CreateIndex
CREATE INDEX "assignment_recipients_user_id_status_idx" ON "assignment_recipients"("user_id", "status");

-- CreateIndex
CREATE INDEX "assignment_recipients_assignment_id_status_idx" ON "assignment_recipients"("assignment_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_recipients_assignment_id_user_id_key" ON "assignment_recipients"("assignment_id", "user_id");

-- CreateIndex
CREATE INDEX "assessment_attempts_user_id_status_idx" ON "assessment_attempts"("user_id", "status");

-- CreateIndex
CREATE INDEX "assessment_attempts_assessment_version_id_status_idx" ON "assessment_attempts"("assessment_version_id", "status");

-- CreateIndex
CREATE INDEX "assessment_attempts_status_deadline_at_idx" ON "assessment_attempts"("status", "deadline_at");

-- CreateIndex
CREATE INDEX "assessment_attempts_submitted_at_idx" ON "assessment_attempts"("submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_attempts_assignment_recipient_id_attempt_number_key" ON "assessment_attempts"("assignment_recipient_id", "attempt_number");

-- CreateIndex
CREATE INDEX "attempt_answers_kmk_competency_id_answered_at_idx" ON "attempt_answers"("kmk_competency_id", "answered_at");

-- CreateIndex
CREATE INDEX "attempt_answers_subject_id_kmk_competency_id_idx" ON "attempt_answers"("subject_id", "kmk_competency_id");

-- CreateIndex
CREATE INDEX "attempt_answers_group_id_kmk_competency_id_idx" ON "attempt_answers"("group_id", "kmk_competency_id");

-- CreateIndex
CREATE INDEX "attempt_answers_academic_period_id_kmk_competency_id_idx" ON "attempt_answers"("academic_period_id", "kmk_competency_id");

-- CreateIndex
CREATE INDEX "attempt_answers_requires_manual_grading_graded_at_idx" ON "attempt_answers"("requires_manual_grading", "graded_at");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_answers_attempt_id_question_id_key" ON "attempt_answers"("attempt_id", "question_id");

-- CreateIndex
CREATE INDEX "evaluation_plans_academic_year_id_active_idx" ON "evaluation_plans"("academic_year_id", "active");

-- CreateIndex
CREATE INDEX "evaluation_plans_created_by_id_idx" ON "evaluation_plans"("created_by_id");

-- CreateIndex
CREATE INDEX "evaluation_plan_items_academic_period_id_idx" ON "evaluation_plan_items"("academic_period_id");

-- CreateIndex
CREATE INDEX "evaluation_plan_items_assessment_id_idx" ON "evaluation_plan_items"("assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_plan_items_plan_id_position_key" ON "evaluation_plan_items"("plan_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "training_modules_assessment_id_key" ON "training_modules"("assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "training_modules_code_key" ON "training_modules"("code");

-- CreateIndex
CREATE INDEX "training_modules_kmk_competency_id_position_idx" ON "training_modules"("kmk_competency_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "training_contents_module_id_position_key" ON "training_contents"("module_id", "position");

-- CreateIndex
CREATE INDEX "training_progress_user_id_status_idx" ON "training_progress"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "training_progress_module_id_user_id_key" ON "training_progress"("module_id", "user_id");

-- CreateIndex
CREATE INDEX "ai_generation_requests_requested_by_id_created_at_idx" ON "ai_generation_requests"("requested_by_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_generation_requests_status_idx" ON "ai_generation_requests"("status");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "phidias_sync_logs_sync_type_started_at_idx" ON "phidias_sync_logs"("sync_type", "started_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_levels" ADD CONSTRAINT "grade_levels_education_level_id_fkey" FOREIGN KEY ("education_level_id") REFERENCES "education_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "academic_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_homeroom_teacher_id_fkey" FOREIGN KEY ("homeroom_teacher_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_areas" ADD CONSTRAINT "teacher_areas_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_areas" ADD CONSTRAINT "teacher_areas_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "academic_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kmk_subcompetencies" ADD CONSTRAINT "kmk_subcompetencies_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "kmk_competencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kmk_indicators" ADD CONSTRAINT "kmk_indicators_subcompetency_id_fkey" FOREIGN KEY ("subcompetency_id") REFERENCES "kmk_subcompetencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_scales" ADD CONSTRAINT "grading_scales_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_scale_bands" ADD CONSTRAINT "grading_scale_bands_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "grading_scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "academic_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_versions" ADD CONSTRAINT "assessment_versions_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_versions" ADD CONSTRAINT "assessment_versions_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_versions" ADD CONSTRAINT "assessment_versions_grading_scale_id_fkey" FOREIGN KEY ("grading_scale_id") REFERENCES "grading_scales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_assessment_version_id_fkey" FOREIGN KEY ("assessment_version_id") REFERENCES "assessment_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_kmk_competency_id_fkey" FOREIGN KEY ("kmk_competency_id") REFERENCES "kmk_competencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_kmk_subcompetency_id_fkey" FOREIGN KEY ("kmk_subcompetency_id") REFERENCES "kmk_subcompetencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assessment_version_id_fkey" FOREIGN KEY ("assessment_version_id") REFERENCES "assessment_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "evaluation_plan_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_recipients" ADD CONSTRAINT "assignment_recipients_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_recipients" ADD CONSTRAINT "assignment_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_assignment_recipient_id_fkey" FOREIGN KEY ("assignment_recipient_id") REFERENCES "assignment_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_assessment_version_id_fkey" FOREIGN KEY ("assessment_version_id") REFERENCES "assessment_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_grading_scale_id_fkey" FOREIGN KEY ("grading_scale_id") REFERENCES "grading_scales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_graded_by_id_fkey" FOREIGN KEY ("graded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_kmk_competency_id_fkey" FOREIGN KEY ("kmk_competency_id") REFERENCES "kmk_competencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_kmk_subcompetency_id_fkey" FOREIGN KEY ("kmk_subcompetency_id") REFERENCES "kmk_subcompetencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_academic_period_id_fkey" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_plans" ADD CONSTRAINT "evaluation_plans_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_plans" ADD CONSTRAINT "evaluation_plans_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_plans" ADD CONSTRAINT "evaluation_plans_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_plans" ADD CONSTRAINT "evaluation_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_plan_items" ADD CONSTRAINT "evaluation_plan_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "evaluation_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_plan_items" ADD CONSTRAINT "evaluation_plan_items_academic_period_id_fkey" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_plan_items" ADD CONSTRAINT "evaluation_plan_items_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_plan_items" ADD CONSTRAINT "evaluation_plan_items_kmk_competency_id_fkey" FOREIGN KEY ("kmk_competency_id") REFERENCES "kmk_competencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_modules" ADD CONSTRAINT "training_modules_kmk_competency_id_fkey" FOREIGN KEY ("kmk_competency_id") REFERENCES "kmk_competencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_modules" ADD CONSTRAINT "training_modules_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_contents" ADD CONSTRAINT "training_contents_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "training_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_progress" ADD CONSTRAINT "training_progress_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "training_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_progress" ADD CONSTRAINT "training_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generation_requests" ADD CONSTRAINT "ai_generation_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generation_requests" ADD CONSTRAINT "ai_generation_requests_assessment_version_id_fkey" FOREIGN KEY ("assessment_version_id") REFERENCES "assessment_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phidias_sync_logs" ADD CONSTRAINT "phidias_sync_logs_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
