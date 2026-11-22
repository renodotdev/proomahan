ALTER TABLE app.fee_schedules DROP CONSTRAINT fee_schedules_recurrence_check;
ALTER TABLE app.fee_schedules ADD CHECK (recurrence IN ('monthly','one_time','annual'));
ALTER TABLE app.fee_schedules ADD COLUMN water_tariff_id uuid;
ALTER TABLE app.fee_schedules ADD FOREIGN KEY (tenant_id,water_tariff_id) REFERENCES app.water_tariffs(tenant_id,id);

ALTER TABLE app.invoices ADD COLUMN fee_schedule_id uuid;
ALTER TABLE app.invoices ADD FOREIGN KEY (tenant_id,fee_schedule_id) REFERENCES app.fee_schedules(tenant_id,id);
DROP INDEX app.one_invoice_per_period;
CREATE UNIQUE INDEX one_invoice_per_period ON app.invoices(tenant_id,unit_id,bill_to_person_id,kind,period)
 WHERE status <> 'void' AND fee_schedule_id IS NULL;
CREATE UNIQUE INDEX one_scheduled_invoice_per_period ON app.invoices(tenant_id,unit_id,fee_schedule_id,period)
 WHERE fee_schedule_id IS NOT NULL;
