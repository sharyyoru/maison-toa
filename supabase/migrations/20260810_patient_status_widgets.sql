-- Manual Mem/Social widgets and automatic rolling 12-month VIP status.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS is_member boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_social_media boolean NOT NULL DEFAULT false;

-- Preserve every formerly manual VIP assignment as membership.
UPDATE public.patients SET is_member = true WHERE is_vip = true;

CREATE INDEX IF NOT EXISTS idx_patients_is_member ON public.patients (is_member) WHERE is_member = true;
CREATE INDEX IF NOT EXISTS idx_patients_is_social_media ON public.patients (is_social_media) WHERE is_social_media = true;

CREATE OR REPLACE FUNCTION public.refresh_patient_vip(target_patient_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  revenue_last_12_months numeric := 0;
  visits_last_12_months integer := 0;
  qualifies boolean;
BEGIN
  IF target_patient_id IS NULL THEN RETURN false; END IF;

  SELECT COALESCE(SUM(CASE
    WHEN upper(COALESCE(status, '')) = 'PAID'
      THEN GREATEST(COALESCE(paid_amount, 0), COALESCE(total_amount, 0))
    ELSE COALESCE(paid_amount, 0)
  END), 0)
  INTO revenue_last_12_months
  FROM public.invoices
  WHERE patient_id = target_patient_id
    AND COALESCE(is_archived, false) = false
    AND COALESCE(is_complimentary, false) = false
    AND upper(COALESCE(status, '')) <> 'CANCELLED'
    AND COALESCE(invoice_date, created_at) >= now() - interval '12 months';

  SELECT COUNT(*)::integer INTO visits_last_12_months
  FROM public.appointments
  WHERE patient_id = target_patient_id
    AND status::text = 'completed'
    AND start_time >= now() - interval '12 months'
    AND linked_parent_appointment_id IS NULL;

  qualifies := revenue_last_12_months >= 12500 OR visits_last_12_months >= 10;
  UPDATE public.patients SET is_vip = qualifies
  WHERE id = target_patient_id AND is_vip IS DISTINCT FROM qualifies;
  RETURN qualifies;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_patient_vip_from_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.refresh_patient_vip(OLD.patient_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.refresh_patient_vip(NEW.patient_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS invoices_refresh_patient_vip ON public.invoices;
CREATE TRIGGER invoices_refresh_patient_vip
AFTER INSERT OR UPDATE OF patient_id, invoice_date, created_at, total_amount, paid_amount, status, is_complimentary, is_archived OR DELETE
ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.refresh_patient_vip_from_activity();

DROP TRIGGER IF EXISTS appointments_refresh_patient_vip ON public.appointments;
CREATE TRIGGER appointments_refresh_patient_vip
AFTER INSERT OR UPDATE OF patient_id, start_time, status, linked_parent_appointment_id OR DELETE
ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.refresh_patient_vip_from_activity();

SELECT public.refresh_patient_vip(id) FROM public.patients;
