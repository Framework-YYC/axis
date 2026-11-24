-- 0005: task types (manual / recurring / action item), action-item topics and delivery details. Additive only.
-- task_type is NULL for existing rows; the effective type is derived (see worker/services/tasks.ts): a repeating task is recurring,
-- an assistant- or integration-created task is an action item, everything else is manual. No existing row is rewritten.
ALTER TABLE tasks ADD COLUMN task_type TEXT CHECK (task_type IN ('manual', 'recurring', 'action_item'));
ALTER TABLE tasks ADD COLUMN topic TEXT CHECK (topic IN ('mention', 'materials', 'delivery', 'equipment', 'coordination', 'hse', 'reporting', 'meeting', 'follow_up', 'other'));
ALTER TABLE tasks ADD COLUMN related_date TEXT;   -- e.g. the delivery's arrival date
ALTER TABLE tasks ADD COLUMN related_time TEXT;   -- HH:MM, optional
ALTER TABLE tasks ADD COLUMN supplier TEXT;       -- delivery: who is delivering (free text, informational)
CREATE INDEX idx_tasks_type ON tasks (task_type, module, status, due_date);
