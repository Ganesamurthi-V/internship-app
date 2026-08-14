-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('student', 'faculty', 'mentor', 'admin');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'pending');

-- CreateEnum
CREATE TYPE "ClientPlatform" AS ENUM ('ios', 'android', 'web');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ios', 'android');

-- CreateEnum
CREATE TYPE "InternshipDomain" AS ENUM ('software_development', 'data_science_ai_ml', 'cyber_security', 'cloud_computing', 'networking', 'web_development', 'business_management', 'other');

-- CreateEnum
CREATE TYPE "InternshipMode" AS ENUM ('offline', 'online', 'hybrid');

-- CreateEnum
CREATE TYPE "InternshipStatus" AS ENUM ('pending', 'approved', 'active', 'completed', 'rejected');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'absent', 'permission_leave', 'holiday', 'weekly_off');

-- CreateEnum
CREATE TYPE "AttendanceMode" AS ENUM ('office', 'online', 'hybrid');

-- CreateEnum
CREATE TYPE "CompletionStatus" AS ENUM ('yes', 'partially', 'no');

-- CreateEnum
CREATE TYPE "DeliverableType" AS ENUM ('code', 'documentation', 'design', 'analysis', 'testing', 'presentation', 'other');

-- CreateEnum
CREATE TYPE "ObjectivesStatus" AS ENUM ('fully', 'partially', 'no');

-- CreateEnum
CREATE TYPE "SkillType" AS ENUM ('technical_knowledge', 'problem_solving', 'communication', 'teamwork', 'time_management', 'professional_discipline', 'adaptability', 'industry_awareness');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('offer_letter', 'joining_proof', 'completion_certificate', 'internship_report', 'project_report', 'attendance_statement', 'mentor_evaluation_doc', 'presentation', 'work_evidence', 'attendance_proof', 'weekly_report_pdf', 'other');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "ExportJobStatus" AS ENUM ('queued', 'running', 'ready', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "name" TEXT,
    "department_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "client_platform" "ClientPlatform",
    "client_version" TEXT,
    "family_id" UUID NOT NULL,
    "rotated_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "expo_push_token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "app_version" TEXT,
    "last_active_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT NOT NULL DEFAULT 'Sri Manakula Vinayagar Engineering College',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "register_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "programme" TEXT NOT NULL,
    "department_id" UUID,
    "year" INTEGER,
    "section" TEXT,
    "student_email" TEXT NOT NULL,
    "mobile" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentors" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "email" TEXT,
    "contact" TEXT,
    "organisation_id" UUID,
    "invite_token" TEXT,
    "invite_expires" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mentors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internships" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "organisation_id" UUID,
    "mentor_id" UUID,
    "faculty_coordinator_id" UUID,
    "domain" "InternshipDomain" NOT NULL,
    "mode" "InternshipMode" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "working_hours_per_day" DECIMAL(4,2) NOT NULL,
    "status" "InternshipStatus" NOT NULL DEFAULT 'pending',
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "submitted_at" TIMESTAMPTZ(6),
    "evidence_uploads_permitted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "internships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL,
    "internship_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "attendance_date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "reporting_time" TEXT,
    "leaving_time" TEXT,
    "total_hours" DECIMAL(5,2),
    "mode" "AttendanceMode",
    "proof_document_id" UUID,
    "leave_reason" TEXT,
    "mentor_verified" BOOLEAN NOT NULL DEFAULT false,
    "mentor_verified_at" TIMESTAMPTZ(6),
    "client_id" UUID,
    "synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_work_logs" (
    "id" UUID NOT NULL,
    "internship_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "activities" TEXT NOT NULL,
    "technologies" TEXT[],
    "task_assigned" TEXT,
    "completion_status" "CompletionStatus",
    "learning" TEXT,
    "challenge" TEXT,
    "solution" TEXT,
    "deliverable_type" "DeliverableType",
    "evidence_document_id" UUID,
    "mentor_interaction" BOOLEAN NOT NULL DEFAULT false,
    "mentor_feedback" TEXT,
    "client_id" UUID,
    "synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "daily_work_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_reports" (
    "id" UUID NOT NULL,
    "internship_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "week_number" INTEGER NOT NULL,
    "week_start_date" DATE NOT NULL,
    "week_end_date" DATE NOT NULL,
    "days_attended" INTEGER,
    "total_hours" DECIMAL(6,2),
    "major_activities" TEXT,
    "technologies_learned" TEXT[],
    "skills_developed" TEXT[],
    "major_assignment" TEXT,
    "problems" TEXT,
    "solutions" TEXT,
    "learning_outcomes" TEXT,
    "mentor_feedback" TEXT,
    "student_self_assessment" TEXT,
    "report_document_id" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "weekly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "final_assessments" (
    "id" UUID NOT NULL,
    "internship_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "completed_successfully" BOOLEAN,
    "total_days_attended" INTEGER,
    "total_hours" DECIMAL(6,2),
    "major_project" TEXT,
    "technologies_mastered" TEXT[],
    "skills_developed" TEXT[],
    "objectives_status" "ObjectivesStatus",
    "usefulness_rating" INTEGER,
    "technical_improvement" TEXT,
    "employability_improvement" TEXT,
    "curriculum_relation" TEXT,
    "real_world_exposure" TEXT,
    "recommend_organisation" BOOLEAN,
    "suggestions" TEXT,
    "submitted_at" TIMESTAMPTZ(6),
    "faculty_unlocked_at" TIMESTAMPTZ(6),
    "faculty_unlocked_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "final_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_ratings" (
    "id" UUID NOT NULL,
    "final_assessment_id" UUID NOT NULL,
    "skill_type" "SkillType" NOT NULL,
    "rating" INTEGER NOT NULL,

    CONSTRAINT "skill_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentor_evaluations" (
    "id" UUID NOT NULL,
    "internship_id" UUID NOT NULL,
    "mentor_id" UUID NOT NULL,
    "technical_knowledge" INTEGER,
    "problem_solving" INTEGER,
    "communication" INTEGER,
    "teamwork" INTEGER,
    "professional_behaviour" INTEGER,
    "punctuality_attendance" INTEGER,
    "ability_to_learn" INTEGER,
    "initiative" INTEGER,
    "quality_of_work" INTEGER,
    "overall_performance" INTEGER,
    "strengths" TEXT,
    "improvement_areas" TEXT,
    "remarks" TEXT,
    "employment_recommendation" BOOLEAN,
    "digital_confirmation" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mentor_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMPTZ(6),
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "verified_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "internship_id" UUID,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "client_platform" "ClientPlatform",
    "client_version" TEXT,
    "ip_address" INET,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "data" JSONB,
    "delivered_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "storage_key" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refresh_token_key" ON "user_sessions"("refresh_token");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_family_id_idx" ON "user_sessions"("family_id");

-- CreateIndex
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_user_id_expo_push_token_key" ON "device_tokens"("user_id", "expo_push_token");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_institution_key" ON "departments"("name", "institution");

-- CreateIndex
CREATE UNIQUE INDEX "organisations_name_key" ON "organisations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_register_number_key" ON "students"("register_number");

-- CreateIndex
CREATE INDEX "students_register_number_idx" ON "students"("register_number");

-- CreateIndex
CREATE INDEX "students_department_id_idx" ON "students"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "mentors_user_id_key" ON "mentors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mentors_invite_token_key" ON "mentors"("invite_token");

-- CreateIndex
CREATE INDEX "mentors_email_idx" ON "mentors"("email");

-- CreateIndex
CREATE INDEX "mentors_organisation_id_idx" ON "mentors"("organisation_id");

-- CreateIndex
CREATE INDEX "internships_student_id_status_idx" ON "internships"("student_id", "status");

-- CreateIndex
CREATE INDEX "internships_start_date_end_date_idx" ON "internships"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "internships_faculty_coordinator_id_idx" ON "internships"("faculty_coordinator_id");

-- CreateIndex
CREATE INDEX "internships_organisation_id_idx" ON "internships"("organisation_id");

-- CreateIndex
CREATE INDEX "internships_status_idx" ON "internships"("status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_proof_document_id_key" ON "attendance"("proof_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_client_id_key" ON "attendance"("client_id");

-- CreateIndex
CREATE INDEX "attendance_internship_id_attendance_date_idx" ON "attendance"("internship_id", "attendance_date");

-- CreateIndex
CREATE INDEX "attendance_student_id_attendance_date_idx" ON "attendance"("student_id", "attendance_date");

-- CreateIndex
CREATE INDEX "attendance_client_id_idx" ON "attendance"("client_id");

-- CreateIndex
CREATE INDEX "attendance_mentor_verified_idx" ON "attendance"("mentor_verified");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_internship_id_attendance_date_key" ON "attendance"("internship_id", "attendance_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_work_logs_evidence_document_id_key" ON "daily_work_logs"("evidence_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_work_logs_client_id_key" ON "daily_work_logs"("client_id");

-- CreateIndex
CREATE INDEX "daily_work_logs_internship_id_work_date_idx" ON "daily_work_logs"("internship_id", "work_date");

-- CreateIndex
CREATE INDEX "daily_work_logs_student_id_work_date_idx" ON "daily_work_logs"("student_id", "work_date");

-- CreateIndex
CREATE INDEX "daily_work_logs_client_id_idx" ON "daily_work_logs"("client_id");

-- CreateIndex
CREATE INDEX "daily_work_logs_mentor_interaction_idx" ON "daily_work_logs"("mentor_interaction");

-- CreateIndex
CREATE UNIQUE INDEX "daily_work_logs_internship_id_work_date_key" ON "daily_work_logs"("internship_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_reports_report_document_id_key" ON "weekly_reports"("report_document_id");

-- CreateIndex
CREATE INDEX "weekly_reports_internship_id_week_number_idx" ON "weekly_reports"("internship_id", "week_number");

-- CreateIndex
CREATE INDEX "weekly_reports_student_id_idx" ON "weekly_reports"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_reports_internship_id_week_number_key" ON "weekly_reports"("internship_id", "week_number");

-- CreateIndex
CREATE UNIQUE INDEX "final_assessments_internship_id_key" ON "final_assessments"("internship_id");

-- CreateIndex
CREATE INDEX "final_assessments_student_id_idx" ON "final_assessments"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "skill_ratings_final_assessment_id_skill_type_key" ON "skill_ratings"("final_assessment_id", "skill_type");

-- CreateIndex
CREATE UNIQUE INDEX "mentor_evaluations_internship_id_key" ON "mentor_evaluations"("internship_id");

-- CreateIndex
CREATE INDEX "mentor_evaluations_internship_id_idx" ON "mentor_evaluations"("internship_id");

-- CreateIndex
CREATE INDEX "mentor_evaluations_mentor_id_idx" ON "mentor_evaluations"("mentor_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");

-- CreateIndex
CREATE INDEX "documents_owner_user_id_document_type_idx" ON "documents"("owner_user_id", "document_type");

-- CreateIndex
CREATE INDEX "documents_internship_id_document_type_idx" ON "documents"("internship_id", "document_type");

-- CreateIndex
CREATE INDEX "documents_verification_status_idx" ON "documents"("verification_status");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "notification_logs_user_id_read_at_idx" ON "notification_logs"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notification_logs_created_at_idx" ON "notification_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "export_jobs_requested_by_status_idx" ON "export_jobs"("requested_by", "status");

-- CreateIndex
CREATE INDEX "export_jobs_status_idx" ON "export_jobs"("status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentors" ADD CONSTRAINT "mentors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentors" ADD CONSTRAINT "mentors_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internships" ADD CONSTRAINT "internships_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internships" ADD CONSTRAINT "internships_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internships" ADD CONSTRAINT "internships_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internships" ADD CONSTRAINT "internships_faculty_coordinator_id_fkey" FOREIGN KEY ("faculty_coordinator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internships" ADD CONSTRAINT "internships_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_internship_id_fkey" FOREIGN KEY ("internship_id") REFERENCES "internships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_proof_document_id_fkey" FOREIGN KEY ("proof_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_work_logs" ADD CONSTRAINT "daily_work_logs_internship_id_fkey" FOREIGN KEY ("internship_id") REFERENCES "internships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_work_logs" ADD CONSTRAINT "daily_work_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_work_logs" ADD CONSTRAINT "daily_work_logs_evidence_document_id_fkey" FOREIGN KEY ("evidence_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_internship_id_fkey" FOREIGN KEY ("internship_id") REFERENCES "internships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_report_document_id_fkey" FOREIGN KEY ("report_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_assessments" ADD CONSTRAINT "final_assessments_internship_id_fkey" FOREIGN KEY ("internship_id") REFERENCES "internships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_assessments" ADD CONSTRAINT "final_assessments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_assessments" ADD CONSTRAINT "final_assessments_faculty_unlocked_by_fkey" FOREIGN KEY ("faculty_unlocked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_ratings" ADD CONSTRAINT "skill_ratings_final_assessment_id_fkey" FOREIGN KEY ("final_assessment_id") REFERENCES "final_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_evaluations" ADD CONSTRAINT "mentor_evaluations_internship_id_fkey" FOREIGN KEY ("internship_id") REFERENCES "internships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_evaluations" ADD CONSTRAINT "mentor_evaluations_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_internship_id_fkey" FOREIGN KEY ("internship_id") REFERENCES "internships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

