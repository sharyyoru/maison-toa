-- Keep automatic VIP qualification as the default while allowing staff to
-- explicitly assign or remove VIP status from the patient header.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS vip_manual_override boolean;

CREATE OR REPLACE FUNCTION public.refresh_patient_vip(target_patient_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  revenue_last_12_months numeric := 0;
  visits_last_12_months integer := 0;
  qualifies boolean;
  manual_override boolean;
  effective_vip boolean;
BEGIN
  IF target_patient_id IS NULL THEN RETURN false; END IF;

  SELECT vip_manual_override INTO manual_override
  FROM public.patients
  WHERE id = target_patient_id;

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
  effective_vip := COALESCE(manual_override, qualifies);

  UPDATE public.patients SET is_vip = effective_vip
  WHERE id = target_patient_id AND is_vip IS DISTINCT FROM effective_vip;
  RETURN effective_vip;
END;
$$;
