-- RLS policies for invoices
CREATE POLICY "Authenticated users can view invoices" ON invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert invoices" ON invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update invoices" ON invoices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete invoices" ON invoices FOR DELETE TO authenticated USING (true);

-- RLS policies for invoice_items
CREATE POLICY "Authenticated users can view invoice_items" ON invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert invoice_items" ON invoice_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update invoice_items" ON invoice_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete invoice_items" ON invoice_items FOR DELETE TO authenticated USING (true);

-- RLS policies for medication_templates
CREATE POLICY "Authenticated users can view medication_templates" ON medication_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert medication_templates" ON medication_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update medication_templates" ON medication_templates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete medication_templates" ON medication_templates FOR DELETE TO authenticated USING (true);

-- RLS policies for medication_template_items
CREATE POLICY "Authenticated users can view medication_template_items" ON medication_template_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert medication_template_items" ON medication_template_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update medication_template_items" ON medication_template_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete medication_template_items" ON medication_template_items FOR DELETE TO authenticated USING (true);
