"use client";

import { useEffect, useState, useMemo } from "react";
import {
  TARDOC_TARIFF_ITEMS,
  TARDOC_MEDICINES,
  CANTON_TAX_POINT_VALUES,
  COST_NEUTRALITY_FACTOR,
  DEFAULT_CANTON,
  calculateTardocPrice,
  formatChf,
  getCantonName,
  type SwissCanton,
  type TardocTariffItem,
  type TardocMedicine,
  type TardocMainChapter,
} from "@/lib/tardoc";

type ActiveTab = "tariffs" | "medicines" | "calculator";

const MAIN_CHAPTERS: { code: TardocMainChapter; name: string; nameFr: string }[] = [
  { code: "A", name: "General Services", nameFr: "Services généraux" },
  { code: "B", name: "Head and Neck", nameFr: "Tête et cou" },
  { code: "C", name: "Eye", nameFr: "Œil" },
  { code: "D", name: "Ear, Nose, Throat", nameFr: "ORL" },
  { code: "E", name: "Cardiovascular", nameFr: "Cardiovasculaire" },
  { code: "F", name: "Digestive System", nameFr: "Système digestif" },
  { code: "G", name: "Urogenital", nameFr: "Urogénital" },
  { code: "H", name: "Musculoskeletal", nameFr: "Musculosquelettique" },
  { code: "I", name: "Nervous System", nameFr: "Système nerveux" },
  { code: "K", name: "Skin", nameFr: "Peau" },
  { code: "T", name: "Chest Area", nameFr: "Thorax" },
];

export default function TardocPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("tariffs");
  const [selectedCanton, setSelectedCanton] = useState<SwissCanton>(DEFAULT_CANTON);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChapter, setSelectedChapter] = useState<TardocMainChapter | "all">("all");
  const [selectedTariffs, setSelectedTariffs] = useState<string[]>([]);
  const [selectedMedicines, setSelectedMedicines] = useState<string[]>([]);
  
  // Calculator state
  const [calcTaxPoints, setCalcTaxPoints] = useState("50");
  const [calcQuantity, setCalcQuantity] = useState("1");
  
  // Export state
  const [exporting, setExporting] = useState(false);

  const taxPointValue = CANTON_TAX_POINT_VALUES[selectedCanton];

  // Filter tariffs
  const filteredTariffs = useMemo(() => {
    let items = TARDOC_TARIFF_ITEMS.filter(t => t.isActive);
    
    if (selectedChapter !== "all") {
      items = items.filter(t => t.mainChapter === selectedChapter);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter(t =>
        t.code.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.descriptionFr.toLowerCase().includes(query) ||
        t.descriptionDe.toLowerCase().includes(query)
      );
    }
    
    return items;
  }, [selectedChapter, searchQuery]);

  // Filter medicines
  const filteredMedicines = useMemo(() => {
    let items = TARDOC_MEDICINES.filter(m => m.isActive);
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter(m =>
        m.name.toLowerCase().includes(query) ||
        m.nameFr.toLowerCase().includes(query) ||
        m.atcCode.toLowerCase().includes(query) ||
        (m.pharmacode && m.pharmacode.includes(query))
      );
    }
    
    return items;
  }, [searchQuery]);

  // Calculate total for selected items
  const selectedTariffsTotal = useMemo(() => {
    return selectedTariffs.reduce((sum, code) => {
      const tariff = TARDOC_TARIFF_ITEMS.find(t => t.code === code);
      if (tariff) {
        return sum + calculateTardocPrice(tariff.taxPoints, selectedCanton);
      }
      return sum;
    }, 0);
  }, [selectedTariffs, selectedCanton]);

  const selectedMedicinesTotal = useMemo(() => {
    return selectedMedicines.reduce((sum, id) => {
      const medicine = TARDOC_MEDICINES.find(m => m.id === id);
      if (medicine) {
        return sum + medicine.pricePublic;
      }
      return sum;
    }, 0);
  }, [selectedMedicines]);

  // Export functions
  const exportToCsv = (type: "tariffs" | "medicines") => {
    setExporting(true);
    
    let csvContent = "";
    const filename = type === "tariffs" 
      ? `tardoc-tariffs-${selectedCanton}-${new Date().toISOString().split('T')[0]}.csv`
      : `tardoc-medicines-${new Date().toISOString().split('T')[0]}.csv`;
    
    if (type === "tariffs") {
      csvContent = "Code,Description (EN),Description (FR),Tax Points,Price (CHF),Duration (min)\n";
      filteredTariffs.forEach(t => {
        const price = calculateTardocPrice(t.taxPoints, selectedCanton);
        csvContent += `"${t.code}","${t.description}","${t.descriptionFr}",${t.taxPoints},${price.toFixed(2)},${t.duration}\n`;
      });
    } else {
      csvContent = "Name,Name (FR),ATC Code,Swissmedic No,Pharmacode,Price (CHF),Requires Rx\n";
      filteredMedicines.forEach(m => {
        csvContent += `"${m.name}","${m.nameFr}","${m.atcCode}","${m.swissmedicNumber || ''}","${m.pharmacode || ''}",${m.pricePublic.toFixed(2)},${m.requiresPrescription ? 'Yes' : 'No'}\n`;
      });
    }
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setExporting(false);
  };

  const copySelectedToClipboard = () => {
    let text = "TARDOC Selection Summary\n";
    text += `Canton: ${getCantonName(selectedCanton)} (${selectedCanton})\n`;
    text += `Tax Point Value: CHF ${taxPointValue.toFixed(2)}\n`;
    text += `Cost Neutrality Factor: ${COST_NEUTRALITY_FACTOR}\n\n`;
    
    if (selectedTariffs.length > 0) {
      text += "Selected Tariffs:\n";
      selectedTariffs.forEach(code => {
        const t = TARDOC_TARIFF_ITEMS.find(item => item.code === code);
        if (t) {
          const price = calculateTardocPrice(t.taxPoints, selectedCanton);
          text += `  ${t.code} - ${t.description}: ${formatChf(price)}\n`;
        }
      });
      text += `Tariffs Subtotal: ${formatChf(selectedTariffsTotal)}\n\n`;
    }
    
    if (selectedMedicines.length > 0) {
      text += "Selected Medicines:\n";
      selectedMedicines.forEach(id => {
        const m = TARDOC_MEDICINES.find(item => item.id === id);
        if (m) {
          text += `  ${m.name}: ${formatChf(m.pricePublic)}\n`;
        }
      });
      text += `Medicines Subtotal: ${formatChf(selectedMedicinesTotal)}\n\n`;
    }
    
    text += `GRAND TOTAL: ${formatChf(selectedTariffsTotal + selectedMedicinesTotal)}`;
    
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                TARDOC Management
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Swiss Medical Tariff System • Effective January 1, 2026
              </p>
            </div>
            
            {/* Canton Selector */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-700">Canton:</label>
              <select
                value={selectedCanton}
                onChange={(e) => setSelectedCanton(e.target.value as SwissCanton)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              >
                {Object.entries(CANTON_TAX_POINT_VALUES).map(([code, value]) => (
                  <option key={code} value={code}>
                    {code} - {getCantonName(code as SwissCanton)} (CHF {value.toFixed(2)}/pt)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-50 rounded-lg px-4 py-3">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Tax Point Value</p>
              <p className="text-lg font-semibold text-slate-900">CHF {taxPointValue.toFixed(2)}</p>
            </div>
            <div className="bg-slate-50 rounded-lg px-4 py-3">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Neutrality Factor</p>
              <p className="text-lg font-semibold text-slate-900">{COST_NEUTRALITY_FACTOR}</p>
            </div>
            <div className="bg-slate-50 rounded-lg px-4 py-3">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Active Tariffs</p>
              <p className="text-lg font-semibold text-slate-900">{TARDOC_TARIFF_ITEMS.filter(t => t.isActive).length}</p>
            </div>
            <div className="bg-slate-50 rounded-lg px-4 py-3">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Active Medicines</p>
              <p className="text-lg font-semibold text-slate-900">{TARDOC_MEDICINES.filter(m => m.isActive).length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-slate-200 p-1 rounded-xl mb-6 w-fit">
          <button
            onClick={() => setActiveTab("tariffs")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "tariffs"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Tariffs
          </button>
          <button
            onClick={() => setActiveTab("medicines")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "medicines"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Medicines
          </button>
          <button
            onClick={() => setActiveTab("calculator")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "calculator"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Calculator
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Panel */}
          <div className="lg:col-span-3">
            {activeTab === "tariffs" && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                {/* Search and Filter Bar */}
                <div className="p-4 border-b border-slate-200">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input
                        type="text"
                        placeholder="Search tariffs by code or description..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      />
                    </div>
                    <select
                      value={selectedChapter}
                      onChange={(e) => setSelectedChapter(e.target.value as TardocMainChapter | "all")}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    >
                      <option value="all">All Chapters</option>
                      {MAIN_CHAPTERS.map(ch => (
                        <option key={ch.code} value={ch.code}>
                          {ch.code} - {ch.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => exportToCsv("tariffs")}
                      disabled={exporting}
                      className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Export CSV
                    </button>
                  </div>
                </div>

                {/* Tariffs Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="w-10 px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedTariffs.length === filteredTariffs.length && filteredTariffs.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTariffs(filteredTariffs.map(t => t.code));
                              } else {
                                setSelectedTariffs([]);
                              }
                            }}
                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Code</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Description</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Tax Points</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Price (CHF)</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTariffs.map((tariff) => {
                        const price = calculateTardocPrice(tariff.taxPoints, selectedCanton);
                        const isSelected = selectedTariffs.includes(tariff.code);
                        
                        return (
                          <tr 
                            key={tariff.code}
                            className={`hover:bg-slate-50 transition-colors ${isSelected ? "bg-sky-50" : ""}`}
                          >
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedTariffs([...selectedTariffs, tariff.code]);
                                  } else {
                                    setSelectedTariffs(selectedTariffs.filter(c => c !== tariff.code));
                                  }
                                }}
                                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-sm font-medium text-slate-900">{tariff.code}</span>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm text-slate-900">{tariff.description}</p>
                              <p className="text-xs text-slate-500">{tariff.descriptionFr}</p>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-sm font-medium text-slate-900">{tariff.taxPoints.toFixed(2)}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-sm font-semibold text-emerald-600">{formatChf(price)}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-sm text-slate-600">{tariff.duration} min</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  
                  {filteredTariffs.length === 0 && (
                    <div className="py-12 text-center">
                      <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-slate-500">No tariffs found matching your criteria</p>
                    </div>
                  )}
                </div>

                {/* Tariffs Footer */}
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                  <p className="text-sm text-slate-600">
                    Showing <span className="font-medium">{filteredTariffs.length}</span> tariffs
                  </p>
                  <p className="text-sm text-slate-600">
                    {selectedTariffs.length} selected
                  </p>
                </div>
              </div>
            )}

            {activeTab === "medicines" && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                {/* Search Bar */}
                <div className="p-4 border-b border-slate-200">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input
                        type="text"
                        placeholder="Search medicines by name, ATC code, or pharmacode..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      />
                    </div>
                    <button
                      onClick={() => exportToCsv("medicines")}
                      disabled={exporting}
                      className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Export CSV
                    </button>
                  </div>
                </div>

                {/* Medicines Grid */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredMedicines.map((medicine) => {
                    const isSelected = selectedMedicines.includes(medicine.id);
                    
                    return (
                      <div
                        key={medicine.id}
                        className={`border rounded-lg p-4 cursor-pointer transition-all ${
                          isSelected 
                            ? "border-sky-500 bg-sky-50 ring-1 ring-sky-500" 
                            : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
                        }`}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedMedicines(selectedMedicines.filter(id => id !== medicine.id));
                          } else {
                            setSelectedMedicines([...selectedMedicines, medicine.id]);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <h3 className="font-medium text-slate-900">{medicine.name}</h3>
                            <p className="text-sm text-slate-500">{medicine.nameFr}</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 mt-1"
                          />
                        </div>
                        
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-xs font-mono text-slate-600">
                            ATC: {medicine.atcCode}
                          </span>
                          {medicine.swissmedicNumber && (
                            <span className="px-2 py-0.5 bg-red-50 rounded text-xs text-red-700">
                              Swissmedic: {medicine.swissmedicNumber}
                            </span>
                          )}
                          {medicine.requiresPrescription && (
                            <span className="px-2 py-0.5 bg-amber-50 rounded text-xs text-amber-700">
                              Rx Required
                            </span>
                          )}
                        </div>
                        
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-xs text-slate-500">{medicine.unitSize}</span>
                          <span className="text-lg font-semibold text-emerald-600">{formatChf(medicine.pricePublic)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {filteredMedicines.length === 0 && (
                  <div className="py-12 text-center">
                    <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-slate-500">No medicines found matching your criteria</p>
                  </div>
                )}

                {/* Medicines Footer */}
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                  <p className="text-sm text-slate-600">
                    Showing <span className="font-medium">{filteredMedicines.length}</span> medicines
                  </p>
                  <p className="text-sm text-slate-600">
                    {selectedMedicines.length} selected
                  </p>
                </div>
              </div>
            )}

            {activeTab === "calculator" && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Tax Point Calculator</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Input Section */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tax Points</label>
                      <input
                        type="number"
                        value={calcTaxPoints}
                        onChange={(e) => setCalcTaxPoints(e.target.value)}
                        min="0"
                        step="0.01"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                      <input
                        type="number"
                        value={calcQuantity}
                        onChange={(e) => setCalcQuantity(e.target.value)}
                        min="1"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Canton</label>
                      <select
                        value={selectedCanton}
                        onChange={(e) => setSelectedCanton(e.target.value as SwissCanton)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      >
                        {Object.entries(CANTON_TAX_POINT_VALUES).map(([code, value]) => (
                          <option key={code} value={code}>
                            {getCantonName(code as SwissCanton)} ({code}) - CHF {value.toFixed(2)}/pt
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  {/* Result Section */}
                  <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-6">
                    <h3 className="text-sm font-medium text-slate-600 mb-4">Calculation Result</h3>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Tax Points</span>
                        <span className="font-mono text-slate-900">{parseFloat(calcTaxPoints) || 0}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">× Tax Point Value</span>
                        <span className="font-mono text-slate-900">CHF {taxPointValue.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">× Neutrality Factor</span>
                        <span className="font-mono text-slate-900">{COST_NEUTRALITY_FACTOR}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">× Quantity</span>
                        <span className="font-mono text-slate-900">{parseInt(calcQuantity) || 1}</span>
                      </div>
                      
                      <div className="border-t border-slate-300 pt-3 mt-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-slate-700">Unit Price</span>
                          <span className="text-lg font-semibold text-slate-900">
                            {formatChf(calculateTardocPrice(parseFloat(calcTaxPoints) || 0, selectedCanton))}
                          </span>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-base font-semibold text-slate-900">Total</span>
                          <span className="text-2xl font-bold text-emerald-600">
                            {formatChf(calculateTardocPrice(parseFloat(calcTaxPoints) || 0, selectedCanton) * (parseInt(calcQuantity) || 1))}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Formula Explanation */}
                <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <h4 className="text-sm font-medium text-amber-800 mb-2">TARDOC Price Formula</h4>
                  <p className="text-sm text-amber-700 font-mono">
                    Price = Tax Points × Tax Point Value × Cost Neutrality Factor × Quantity
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Selection Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 sticky top-6">
              <div className="p-4 border-b border-slate-200">
                <h2 className="font-semibold text-slate-900">Selection Summary</h2>
                <p className="text-xs text-slate-500 mt-1">
                  {getCantonName(selectedCanton)} ({selectedCanton})
                </p>
              </div>
              
              <div className="p-4 space-y-4">
                {/* Selected Tariffs */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                    Tariffs ({selectedTariffs.length})
                  </h3>
                  {selectedTariffs.length === 0 ? (
                    <p className="text-xs text-slate-400">No tariffs selected</p>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {selectedTariffs.map(code => {
                        const t = TARDOC_TARIFF_ITEMS.find(item => item.code === code);
                        if (!t) return null;
                        const price = calculateTardocPrice(t.taxPoints, selectedCanton);
                        return (
                          <div key={code} className="flex items-center justify-between text-xs bg-slate-50 rounded px-2 py-1.5">
                            <span className="font-mono text-slate-700 truncate flex-1">{code}</span>
                            <span className="text-emerald-600 font-medium ml-2">{formatChf(price)}</span>
                            <button
                              onClick={() => setSelectedTariffs(selectedTariffs.filter(c => c !== code))}
                              className="ml-2 text-slate-400 hover:text-red-500"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {selectedTariffs.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between text-sm">
                      <span className="text-slate-600">Subtotal</span>
                      <span className="font-semibold text-slate-900">{formatChf(selectedTariffsTotal)}</span>
                    </div>
                  )}
                </div>

                {/* Selected Medicines */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                    Medicines ({selectedMedicines.length})
                  </h3>
                  {selectedMedicines.length === 0 ? (
                    <p className="text-xs text-slate-400">No medicines selected</p>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {selectedMedicines.map(id => {
                        const m = TARDOC_MEDICINES.find(item => item.id === id);
                        if (!m) return null;
                        return (
                          <div key={id} className="flex items-center justify-between text-xs bg-slate-50 rounded px-2 py-1.5">
                            <span className="text-slate-700 truncate flex-1">{m.name}</span>
                            <span className="text-emerald-600 font-medium ml-2">{formatChf(m.pricePublic)}</span>
                            <button
                              onClick={() => setSelectedMedicines(selectedMedicines.filter(i => i !== id))}
                              className="ml-2 text-slate-400 hover:text-red-500"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {selectedMedicines.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between text-sm">
                      <span className="text-slate-600">Subtotal</span>
                      <span className="font-semibold text-slate-900">{formatChf(selectedMedicinesTotal)}</span>
                    </div>
                  )}
                </div>

                {/* Grand Total */}
                {(selectedTariffs.length > 0 || selectedMedicines.length > 0) && (
                  <div className="pt-4 border-t border-slate-200">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-900">Grand Total</span>
                      <span className="text-xl font-bold text-emerald-600">
                        {formatChf(selectedTariffsTotal + selectedMedicinesTotal)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="pt-4 space-y-2">
                  <button
                    onClick={copySelectedToClipboard}
                    disabled={selectedTariffs.length === 0 && selectedMedicines.length === 0}
                    className="w-full px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy to Clipboard
                  </button>
                  <button
                    onClick={() => {
                      setSelectedTariffs([]);
                      setSelectedMedicines([]);
                    }}
                    disabled={selectedTariffs.length === 0 && selectedMedicines.length === 0}
                    className="w-full px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
