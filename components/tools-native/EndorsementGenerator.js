"use client";

import React, { useEffect, useRef, useState } from 'react';
import Modal from 'react-modal';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import EndorsementDisclaimer from '@/components/legal/EndorsementDisclaimer';
import templates from './templates';
import styles from './EndorsementGenerator.module.css';
import { fetchSavedPeople, fetchDefaultCfi, formatStoredDateForDisplay } from '@/lib/saved-people';
import { fetchCurrentProfile } from '@/lib/profile';
import { getSupabaseClient } from '@/lib/supabase';

const FIELD_CONFIG = [
  { key: 'instructorName', label: 'Instructor name', type: 'text', required: true, autoComplete: 'name' },
  { key: 'instructorCertNumber', label: 'Instructor certificate number', type: 'text', required: true, autoComplete: 'off' },
  { key: 'instructorCertExpDate', label: 'Instructor certificate expiration *', type: 'text', required: true, autoComplete: 'off', placeholder: 'MM/DD/YYYY', inputMode: 'numeric', maxLength: 10 },
  { key: 'studentName', label: 'Student name', type: 'text', required: true, autoComplete: 'name' },
  { key: 'studentCertNumber', label: 'Student certificate number', type: 'text', required: false, autoComplete: 'off' },
  { key: 'date', label: 'Endorsement date', type: 'text', required: true, autoComplete: 'off', placeholder: 'MM/DD/YYYY', inputMode: 'numeric', maxLength: 10 },
];

const INITIAL_FORM_DATA = {
  instructorName: '',
  instructorCertNumber: '',
  instructorCertExpDate: '',
  studentName: '',
  studentCertNumber: '',
  date: '',
};

const BASE_FIELD_KEYS = new Set(FIELD_CONFIG.map((field) => field.key));

const templateEntries = Object.entries(templates);

function sanitizeText(text) {
  return text.replace(/\t/g, ' ').replace(/[\u{0080}-\u{FFFF}]/gu, '');
}

function formatDateForPdf(value) {
  if (!value) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${month}/${day}/${year}`;
  }

  return value;
}

function formatInputValue(field, value) {
  if (field === 'instructorCertExpDate') {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) {
      return digits;
    }
    if (digits.length <= 4) {
      return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }

  if (field === 'date') {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) {
      return digits;
    }
    if (digits.length <= 4) {
      return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }

  return value;
}

function splitTextIntoLines(text, font, fontSize, maxWidth) {
  const paragraphs = text.split('\n');
  const lines = [];

  paragraphs.forEach((paragraph) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let currentLine = '';

    if (words.length === 0) {
      lines.push('');
      return;
    }

    words.forEach((word) => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }
    lines.push('');
  });

  return lines.at(-1) === '' ? lines.slice(0, -1) : lines;
}

function getTemplateCategory(title) {
  if (/cross-country/i.test(title)) {
    return 'Cross-country';
  }
  if (/solo/i.test(title)) {
    return 'Solo';
  }
  if (/CFI|flight instructor|spin|FOI|CFII/i.test(title)) {
    return 'Instructor';
  }
  if (/helicopter|R-22|R-44|autorotation/i.test(title)) {
    return 'Rotorcraft';
  }
  if (/review|check|proficiency|practical test|written|knowledge/i.test(title)) {
    return 'Review/Test';
  }
  return 'General';
}

function buildPreviewText(body) {
  return body.replace(/\s+/g, ' ').replace(/\{[^}]+\}/g, '[field]').trim();
}

function getFieldHelperText(field) {
  return field.placeholder || `Used to complete the ${field.label.toLowerCase()} portion of the selected endorsement.`;
}

function getFieldSelectPrompt(field) {
  if (field.type === 'multi-select') {
    return 'Select one or more';
  }

  return field.required ? 'Select' : 'Optional';
}

function hasFieldValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return String(value ?? '').trim().length > 0;
}

function joinWithAnd(values) {
  if (values.length <= 1) {
    return values[0] || '';
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function formatTemplateFieldValue(key, value) {
  if (key === 'cfiKnowledgeTests') {
    const selected = Array.isArray(value) ? value.filter(Boolean) : [];
    if (selected.length === 0) {
      return '';
    }

    const joined = joinWithAnd(selected);
    return selected.length === 1
      ? `${joined} airman knowledge test`
      : `${joined} airman knowledge tests`;
  }

  if (Array.isArray(value)) {
    return joinWithAnd(value.filter(Boolean));
  }

  return BASE_FIELD_KEYS.has(key) ? value : formatDateForPdf(String(value ?? '').trim());
}

function EndorsementGenerator() {
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState({});
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [detailsModalIsOpen, setDetailsModalIsOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [selectedTemplates, setSelectedTemplates] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusMessage, setStatusMessage] = useState('Fill the form, select endorsements, then preview to confirm and open the PDF packet.');
  const [templateFieldData, setTemplateFieldData] = useState({});
  const [sessionIdentity, setSessionIdentity] = useState('');
  const [savedCfis, setSavedCfis] = useState([]);
  const [savedStudents, setSavedStudents] = useState([]);
  const [selectedCfiId, setSelectedCfiId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');

  const canvasRef = useRef(null);
  const signatureDirtyRef = useRef(false);
  const pdfUrlRef = useRef('');
  const defaultCfiAppliedRef = useRef(false);

  useEffect(() => {
    Modal.setAppElement(document.body);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const context = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.scale(ratio, ratio);
    context.lineWidth = 6.4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f172a';

    let drawing = false;

    const getPoint = (event) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    const handlePointerDown = (event) => {
      drawing = true;
      canvas.setPointerCapture?.(event.pointerId);
      const { x, y } = getPoint(event);
      context.beginPath();
      context.moveTo(x, y);
    };

    const handlePointerMove = (event) => {
      if (!drawing) {
        return;
      }

      const { x, y } = getPoint(event);
      signatureDirtyRef.current = true;
      context.lineTo(x, y);
      context.stroke();
    };

    const handlePointerUp = () => {
      if (!drawing) {
        return;
      }

      drawing = false;
      context.closePath();
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointerleave', handlePointerUp);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();

    async function loadSavedProfiles() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        setSessionIdentity('');

        if (!session?.user) {
          setSavedCfis([]);
          setSavedStudents([]);
          defaultCfiAppliedRef.current = false;
          return;
        }

        const [cfis, students, defaultCfi, profile] = await Promise.all([
          fetchSavedPeople(session.user.id, 'cfi'),
          fetchSavedPeople(session.user.id, 'student'),
          fetchDefaultCfi(session.user.id),
          fetchCurrentProfile(session.user.id),
        ]);

        setSavedCfis(cfis);
        setSavedStudents(students);
        setSessionIdentity(profile?.display_name || session.user.email || '');

        if (defaultCfi && !defaultCfiAppliedRef.current) {
          setSelectedCfiId((current) => current || defaultCfi.id);
          setFormData((prev) => ({
            ...prev,
            instructorName: prev.instructorName.trim() ? prev.instructorName : defaultCfi.display_name || '',
            instructorCertNumber: prev.instructorCertNumber.trim()
              ? prev.instructorCertNumber
              : defaultCfi.cert_number || '',
            instructorCertExpDate: prev.instructorCertExpDate.trim()
              ? prev.instructorCertExpDate
              : formatStoredDateForDisplay(defaultCfi.cert_exp_date) || '',
          }));
          defaultCfiAppliedRef.current = true;
        }
      } catch (error) {
        console.error(error);
      }
    }

    loadSavedProfiles();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadSavedProfiles();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const visibleTemplates = templateEntries
    .map(([title, template]) => ({
      title,
      template,
      category: getTemplateCategory(title),
      preview: buildPreviewText(template.text),
      selected: selectedTemplates.includes(title),
    }))
    .filter((template) => {
      if (!searchTerm.trim()) {
        return true;
      }

      const query = searchTerm.trim().toLowerCase();
      return (
        template.title.toLowerCase().includes(query) ||
        template.category.toLowerCase().includes(query) ||
        template.preview.toLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      if (left.selected !== right.selected) {
        return left.selected ? -1 : 1;
      }
      return left.title.localeCompare(right.title);
    });

  const selectedTemplateDetails = selectedTemplates.map((title) => {
    return {
      title,
      fields: templates[title]?.fields ?? [],
    };
  });

  const selectedTemplateFields = selectedTemplates.reduce((accumulator, templateKey) => {
    const template = templates[templateKey];
    if (!template) {
      return accumulator;
    }

    template.fields.forEach((field) => {
      if (!accumulator.some((existingField) => existingField.key === field.key)) {
        accumulator.push(field);
      }
    });

    return accumulator;
  }, []);

  const completedTemplateFieldCount = selectedTemplateFields.filter((field) =>
    hasFieldValue(templateFieldData[field.key])
  ).length;

  const getFieldsForTemplates = (templateKeys) =>
    templateKeys.reduce((accumulator, templateKey) => {
      const template = templates[templateKey];
      if (!template) {
        return accumulator;
      }

      template.fields.forEach((field) => {
        if (!accumulator.some((existingField) => existingField.key === field.key)) {
          accumulator.push(field);
        }
      });

      return accumulator;
    }, []);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    signatureDirtyRef.current = false;
    setStatusMessage('Signature cleared. PDF generation will leave the signature area blank.');
  };

  const openModal = () => setModalIsOpen(true);
  const closeModal = () => setModalIsOpen(false);
  const openDetailsModal = () => setDetailsModalIsOpen(true);
  const closeDetailsModal = () => setDetailsModalIsOpen(false);
  const handleChange = (field) => (event) => {
    const nextValue = formatInputValue(field, event.target.value);
    setFormData((prev) => ({ ...prev, [field]: nextValue }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleDynamicFieldChange = (field) => (event) => {
    const nextValue = field.type === 'multi-select'
      ? Array.from(event.target.selectedOptions, (option) => option.value)
      : event.target.value;

    setTemplateFieldData((prev) => ({ ...prev, [field.key]: nextValue }));
    setErrors((prev) => ({ ...prev, [field.key]: undefined }));
  };

  const handleMultiSelectToggle = (fieldKey, option) => {
    setTemplateFieldData((prev) => {
      const current = Array.isArray(prev[fieldKey]) ? prev[fieldKey] : [];
      const nextValue = current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option];

      return { ...prev, [fieldKey]: nextValue };
    });
    setErrors((prev) => ({ ...prev, [fieldKey]: undefined }));
  };

  const handleTemplateSelection = (templateKey) => {
    const isAlreadySelected = selectedTemplates.includes(templateKey);
    const nextSelected = isAlreadySelected
      ? selectedTemplates.filter((key) => key !== templateKey)
      : [...selectedTemplates, templateKey];

    setSelectedTemplates(nextSelected);

    setErrors((prev) => ({ ...prev, selectedTemplates: undefined }));

    if (!isAlreadySelected) {
      const nextFields = getFieldsForTemplates(nextSelected);
      const hasMissingRequiredFields = nextFields.some(
        (field) => field.required && !hasFieldValue(templateFieldData[field.key])
      );

      if (hasMissingRequiredFields) {
        setModalIsOpen(false);
        setDetailsModalIsOpen(true);
        setStatusMessage('Complete the template details required for the endorsement wording.');
      }
    }
  };

  const handleSelectCfi = (event) => {
    const nextId = event.target.value;
    setSelectedCfiId(nextId);

    const selected = savedCfis.find((person) => person.id === nextId);
    if (!selected) return;

    setFormData((prev) => ({
      ...prev,
      instructorName: selected.display_name || prev.instructorName,
      instructorCertNumber: selected.cert_number || '',
      instructorCertExpDate: formatStoredDateForDisplay(selected.cert_exp_date) || '',
    }));
  };

  const handleSelectStudent = (event) => {
    const nextId = event.target.value;
    setSelectedStudentId(nextId);

    const selected = savedStudents.find((person) => person.id === nextId);
    if (!selected) return;

    setFormData((prev) => ({
      ...prev,
      studentName: selected.display_name || prev.studentName,
      studentCertNumber: selected.cert_number || '',
    }));
  };

  const validateForm = () => {
    const nextErrors = {};
    let hasTemplateFieldErrors = false;

    FIELD_CONFIG.forEach((field) => {
      if (field.required && !formData[field.key].trim()) {
        nextErrors[field.key] = 'Required';
      }
    });

    selectedTemplateFields.forEach((field) => {
      const value = templateFieldData[field.key];
      if (field.required && !hasFieldValue(value)) {
        nextErrors[field.key] = 'Required';
        hasTemplateFieldErrors = true;
      }
    });

    if (formData.instructorCertExpDate && !/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/.test(formData.instructorCertExpDate)) {
      nextErrors.instructorCertExpDate = 'Use MM/DD/YYYY';
    }

    if (formData.date && !/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/.test(formData.date)) {
      nextErrors.date = 'Use MM/DD/YYYY';
    }

    if (selectedTemplates.length === 0) {
      nextErrors.selectedTemplates = 'Select at least one endorsement template.';
    }

    setErrors(nextErrors);
    if (hasTemplateFieldErrors) {
      setDetailsModalIsOpen(true);
    }
    return Object.keys(nextErrors).length === 0;
  };

  const createTemplateDraft = (templateKey) => {
    const mappedData = {
      studentName: formData.studentName.trim(),
      studentCertNumber: formData.studentCertNumber.trim(),
      date: formatDateForPdf(formData.date),
      instructorName: formData.instructorName.trim(),
      instructorCertNumber: formData.instructorCertNumber.trim(),
      instructorCertExpDate: formatDateForPdf(formData.instructorCertExpDate),
      ...Object.fromEntries(
        Object.entries(templateFieldData).map(([key, value]) => [
          key,
          formatTemplateFieldValue(key, value),
        ])
      ),
    };

    const template = templates[templateKey];

    return sanitizeText(
      Object.entries(mappedData).reduce(
        (content, [token, value]) => content.replaceAll(`{${token}}`, value),
        template.text
      )
    );
  };

  const buildPdfUrl = async () => {
    if (!validateForm()) {
      setStatusMessage('Resolve the highlighted fields before previewing the PDF.');
      return null;
    }

    try {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const fontSize = 7;
      const lineHeight = fontSize * 1.2;
      const pageWidth = 612;
      const pageHeight = 792;
      const margin = 32;
      const columns = 2;
      const boxGapX = 5;
      const boxGapY = 5;
      const boxWidth = 245;
      const boxPaddingX = 2;
      const boxPaddingTop = 0;
      const boxPaddingBottom = 0;
      const signatureDrop = lineHeight * 2;
      const textWidth = boxWidth - boxPaddingX * 2;
      const rowWidth = columns * boxWidth + boxGapX;
      const baseX = (pageWidth - rowWidth) / 2;

      let signatureImage;

      if (signatureDirtyRef.current) {
        const dataUrl = canvasRef.current.toDataURL('image/png');
        const signatureImageBytes = await fetch(dataUrl).then((response) => response.arrayBuffer());
        signatureImage = await doc.embedPng(signatureImageBytes);
      }

      const rows = [];
      for (let index = 0; index < selectedTemplates.length; index += columns) {
        const rowTemplates = selectedTemplates.slice(index, index + columns).map((templateKey) => {
          const content = createTemplateDraft(templateKey);
          const lines = splitTextIntoLines(content, font, fontSize, textWidth);
          const textHeight = lines.length * lineHeight;
          const signatureHeight = signatureImage ? 16 + signatureDrop : 7 + signatureDrop;
          const boxHeight = textHeight + signatureHeight + boxPaddingTop + boxPaddingBottom;

          return {
            templateKey,
            lines,
            boxHeight,
          };
        });

        rows.push({
          cells: rowTemplates,
          rowHeight: Math.max(...rowTemplates.map((template) => template.boxHeight)),
        });
      }

      const maxTableHeight = pageHeight - margin * 2;
      const pages = [];
      let currentPageRows = [];
      let currentHeight = 0;

      rows.forEach((row) => {
        const nextHeight = currentPageRows.length > 0
          ? currentHeight + boxGapY + row.rowHeight
          : currentHeight + row.rowHeight;

        if (currentPageRows.length > 0 && nextHeight > maxTableHeight) {
          pages.push(currentPageRows);
          currentPageRows = [];
          currentHeight = 0;
        }

        currentPageRows.push(row);
        currentHeight = currentPageRows.length > 1
          ? currentHeight + boxGapY + row.rowHeight
          : currentHeight + row.rowHeight;
      });

      if (currentPageRows.length > 0) {
        pages.push(currentPageRows);
      }

      pages.forEach((pageRows) => {
        const page = doc.addPage([pageWidth, pageHeight]);
        let currentTop = pageHeight - margin;
        pageRows.forEach((row, rowIndex) => {
          if (rowIndex > 0) {
            currentTop -= boxGapY;
          }

          row.cells.forEach((template, columnIndex) => {
            const x = baseX + columnIndex * (boxWidth + boxGapX);
            const boxY = currentTop - template.boxHeight;

            page.drawRectangle({
              x,
              y: boxY,
              width: boxWidth,
              height: template.boxHeight,
              borderColor: rgb(0.15, 0.23, 0.33),
              borderWidth: 1,
            });

            let textY = currentTop - fontSize - boxPaddingTop;
            template.lines.forEach((line) => {
              page.drawText(line, {
                x: x + boxPaddingX,
                y: textY,
                size: fontSize,
                font,
              });
              textY -= lineHeight;
            });

            const signatureLabelY = boxY + boxPaddingBottom + (signatureImage ? 6 : 2);
            page.drawText('Signature:', {
              x: x + boxPaddingX,
              y: signatureLabelY,
              size: fontSize,
              font,
            });

            if (signatureImage) {
              page.drawImage(signatureImage, {
                x: x + 56,
                y: signatureLabelY - 8,
                width: 72,
                height: 30,
              });
            } else {
              page.drawLine({
                start: { x: x + 56, y: signatureLabelY + 2 },
                end: { x: x + 130, y: signatureLabelY + 2 },
                thickness: 1.15,
                color: rgb(0.15, 0.23, 0.33),
              });
            }
          });

          currentTop -= row.rowHeight;
        });
      });

      const pdfBytes = await doc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const nextPdfUrl = URL.createObjectURL(blob);

      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
      }

      pdfUrlRef.current = nextPdfUrl;
      setPdfUrl(nextPdfUrl);
      setStatusMessage(`PDF ready. Generated ${selectedTemplates.length} endorsement draft(s).`);
      return nextPdfUrl;
    } catch (error) {
      console.error('Error generating PDF:', error);
      setStatusMessage('Failed to generate PDF. Check the console and try again.');
      return null;
    }
  };

  const handlePreview = async () => {
    if (!validateForm()) {
      setStatusMessage('Resolve the highlighted fields before previewing the PDF.');
      return;
    }

    const confirmed = window.confirm(
      `Preview ${selectedTemplates.length} endorsement draft(s)?\n\nInstructor: ${formData.instructorName.trim()}\nStudent: ${formData.studentName.trim()}\nDate: ${formatDateForPdf(formData.date)}`
    );

    if (!confirmed) {
      setStatusMessage('Preview cancelled. Review the confirmation details and try again when ready.');
      return;
    }

    const previewWindow = window.open('', '_blank');
    if (!previewWindow) {
      setStatusMessage('The preview window was blocked by the browser.');
      return;
    }

    previewWindow.document.write('<title>PilotSeal PDF Preview</title><p style="font-family: sans-serif; padding: 20px;">Generating PDF preview...</p>');

    const nextPdfUrl = await buildPdfUrl();
    if (!nextPdfUrl) {
      previewWindow.close();
      return;
    }

    previewWindow.location.href = nextPdfUrl;
  };

  const handlePrint = () => {
    if (!pdfUrl) {
      setStatusMessage('Open a preview first to generate the PDF before printing.');
      return;
    }

    const printWindow = window.open(pdfUrl, '_blank');
    if (!printWindow) {
      setStatusMessage('The print window was blocked by the browser.');
      return;
    }

    printWindow.onload = () => {
      printWindow.print();
    };
  };

  return (
    <>
      <div className={styles.page}>
        <section className={styles.utilityBar}>
          <h1 className={styles.utilityTitle}>Endorsement Generator</h1>
          <p className={styles.utilityNote}>{selectedTemplates.length} selected</p>
        </section>

        <div className={styles.workspace}>
          <section className={styles.mainPanel}>
            <div className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Certificate details</h2>
                </div>
              </div>

              {sessionIdentity ? (
                <div className={styles.savedProfiles}>
                  <p className={styles.savedProfileHint}>Signed in as {sessionIdentity}. Select saved profiles to autofill the form.</p>
                  <div className={styles.savedProfileRow}>
                    <label className={styles.field}>
                      <span>Saved CFI</span>
                      <select value={selectedCfiId} onChange={handleSelectCfi}>
                        <option value="">Select a saved CFI</option>
                        {savedCfis.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.display_name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>Saved Student</span>
                      <select value={selectedStudentId} onChange={handleSelectStudent}>
                        <option value="">Select a saved student</option>
                        {savedStudents.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.display_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ) : null}

              <div className={styles.inputGrid}>
                {FIELD_CONFIG.map((field) => (
                  <label key={field.key} className={styles.field}>
                    <span>
                      {field.label}
                      {field.required ? ' *' : ' (optional)'}
                    </span>
                    <input
                      type={field.type}
                      value={formData[field.key]}
                      onChange={handleChange(field.key)}
                      autoComplete={field.autoComplete}
                      placeholder={field.placeholder}
                      inputMode={field.inputMode}
                      maxLength={field.maxLength}
                      className={errors[field.key] ? styles.fieldError : ''}
                    />
                    {errors[field.key] ? <small>{errors[field.key]}</small> : null}
                  </label>
                ))}
              </div>
            </div>

            {selectedTemplateFields.length > 0 ? (
              <div className={styles.card}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2>Template details</h2>
                    <p className={styles.sectionCopy}>
                      Complete the extra endorsement-specific entries in a separate dialog before previewing the PDF.
                    </p>
                  </div>
                  <button className={styles.ghostButton} onClick={openDetailsModal} type="button">
                    {completedTemplateFieldCount === selectedTemplateFields.length ? 'Review details' : 'Add details'}
                  </button>
                </div>

                <div className={styles.templateDetailsSummary}>
                  <span>
                    {completedTemplateFieldCount} of {selectedTemplateFields.length} required field
                    {selectedTemplateFields.length === 1 ? '' : 's'} completed
                  </span>
                  {selectedTemplateDetails
                    .filter((template) => template.fields.length > 0)
                    .map((template) => (
                      <span key={template.title} className={styles.templateDetailsChip}>
                        {template.title}
                      </span>
                    ))}
                </div>
              </div>
            ) : null}

            <div className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Signature</h2>
                </div>
                <div className={styles.signatureActions}>
                  <button className={styles.ghostButton} onClick={clearSignature} type="button">
                    Clear
                  </button>
                </div>
              </div>

              <div className={styles.signatureFrame}>
                <canvas ref={canvasRef} className={styles.signatureCanvas} />
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Export</h2>
                </div>
              </div>

              <div className={styles.actionRow}>
                <button className={styles.primaryButton} onClick={openModal} type="button">
                  Select endorsements ({selectedTemplates.length})
                </button>
                <button className={styles.secondaryButton} onClick={handlePreview} type="button">
                  Preview
                </button>
                <button className={styles.secondaryButton} onClick={handlePrint} type="button" disabled={!pdfUrl}>
                  Print
                </button>
              </div>

              <p className={styles.status}>{statusMessage}</p>
              {errors.selectedTemplates ? <p className={styles.inlineError}>{errors.selectedTemplates}</p> : null}
              <EndorsementDisclaimer className="mt-5" />
            </div>
          </section>

          <aside className={styles.sidePanel}>
            <div className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Selection summary</h2>
                </div>
              </div>

              {selectedTemplateDetails.length > 0 ? (
                <div className={styles.selectedList}>
                  {selectedTemplateDetails.map((template) => (
                    <div key={template.title} className={styles.selectedCard}>
                      <div className={styles.selectedMeta}>
                        <h3>{template.title}</h3>
                        <button type="button" onClick={() => handleTemplateSelection(template.title)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <p>No templates selected yet.</p>
                  <button className={styles.ghostButton} onClick={openModal} type="button">
                    Browse templates
                  </button>
                </div>
              )}
            </div>

            <div className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Workflow notes</h2>
                </div>
              </div>
              <ul className={styles.noteList}>
                <li>Use template search to narrow by solo, review, or instructor endorsements.</li>
                <li>Preview now confirms instructor, student, and date before generating the PDF packet.</li>
                <li>Blank signature mode keeps the signature line but omits the image.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>

      <Modal
        isOpen={detailsModalIsOpen}
        onRequestClose={closeDetailsModal}
        contentLabel="Complete template details"
        className="Modal"
        overlayClassName="Overlay"
      >
          <div className="endorsementModal endorsementModalDetails">
            <div className="endorsementModalHeader">
              <div>
                <h2>Template details</h2>
                <p>These values complete the selected endorsement wording before PDF generation.</p>
              </div>
              <div className="endorsementModalActions">
                <button
                  type="button"
                  className="modalGhostButton"
                  onClick={() => {
                    closeDetailsModal();
                    openModal();
                  }}
                >
                  Select next endorsement
                </button>
                <button type="button" className="modalPrimaryButton" onClick={closeDetailsModal}>
                  Finish selection
                </button>
              </div>
            </div>

            <div className={styles.templateDetailsModalBody}>
              <div className={styles.templateDetailsModalMeta}>
                <span>
                  {completedTemplateFieldCount} of {selectedTemplateFields.length} required field
                  {selectedTemplateFields.length === 1 ? '' : 's'} completed
                </span>
                <div className={styles.templateDetailsSummary}>
                  {selectedTemplateDetails
                    .filter((template) => template.fields.length > 0)
                    .map((template) => (
                      <span key={template.title} className={styles.templateDetailsChip}>
                        {template.title}
                      </span>
                    ))}
                </div>
              </div>

              <div className={styles.templateDetailsModalGrid}>
                {selectedTemplateFields.map((field) => (
                  <label key={field.key} className={`${styles.field} ${styles.templateDetailsField}`}>
                    <span>
                      {field.label}
                      {field.required ? ' *' : ' (optional)'}
                    </span>
                    <p className={styles.templateDetailsFieldHint}>{getFieldHelperText(field)}</p>
                    {field.type === 'select' ? (
                    <select
                      value={templateFieldData[field.key] || ''}
                      onChange={handleDynamicFieldChange(field)}
                      className={errors[field.key] ? styles.fieldError : ''}
                      title={getFieldHelperText(field)}
                    >
                      <option value="">{getFieldSelectPrompt(field)}</option>
                      {field.options?.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                      </select>
                    ) : field.type === 'multi-select' ? (
                      <div className={`${styles.templateOptionGrid} ${errors[field.key] ? styles.fieldError : ''}`}>
                        {field.options?.map((option) => {
                          const selected = (templateFieldData[field.key] || []).includes(option);
                          return (
                            <button
                              key={option}
                              type="button"
                              className={`${styles.templateOptionPill} ${selected ? styles.templateOptionPillActive : ''}`}
                              onClick={() => handleMultiSelectToggle(field.key, option)}
                              aria-pressed={selected}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <input
                        type={field.type === 'date' ? 'date' : 'text'}
                        value={templateFieldData[field.key] || ''}
                        onChange={handleDynamicFieldChange(field)}
                        className={errors[field.key] ? styles.fieldError : ''}
                        placeholder={getFieldHelperText(field)}
                      />
                    )}
                    {errors[field.key] ? <small>{errors[field.key]}</small> : null}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Modal>

      <Modal
        isOpen={modalIsOpen}
        onRequestClose={closeModal}
        contentLabel="Select endorsement templates"
        className="Modal"
        overlayClassName="Overlay"
      >
        <div className="endorsementModal">
          <div className="endorsementModalHeader">
            <div>
              <h2>Select endorsement templates</h2>
              <p>Selected templates stay pinned to the top of the result list.</p>
            </div>
            <div className="endorsementModalActions">
              <button type="button" className="modalGhostButton" onClick={() => setSelectedTemplates([])}>
                Clear all
              </button>
              <button type="button" className="modalPrimaryButton" onClick={closeModal}>
                Finish selection
              </button>
            </div>
          </div>

          <div className="endorsementModalToolbar">
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by endorsement title, category, or wording"
              className="endorsementModalSearch"
            />
            <span className="endorsementResultCount">{visibleTemplates.length} results</span>
          </div>

          {selectedTemplates.length > 0 ? (
            <div className="endorsementSelectedBar">
              {selectedTemplates.map((template) => (
                <span key={template} className="endorsementChip">
                  {template}
                  <button type="button" className="endorsementChipRemove" onClick={() => handleTemplateSelection(template)}>
                    x
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="endorsementTemplateScroller">
            <div className="endorsementTemplateGrid">
              {visibleTemplates.map((template) => (
                <button
                  key={template.title}
                  type="button"
                  className={`endorsementTemplateCard ${template.selected ? 'endorsementTemplateCardSelected' : ''}`}
                  onClick={() => handleTemplateSelection(template.title)}
                  aria-pressed={template.selected}
                >
                  <div className="endorsementTemplateTop">
                    <span className="endorsementTemplateCategory">{template.category}</span>
                    <span className="endorsementTemplateToggle">{template.selected ? 'Selected' : 'Add'}</span>
                  </div>
                  <h3>{template.title}</h3>
                  <p className="endorsementTemplatePreview">{template.preview.slice(0, 220)}...</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default EndorsementGenerator;
