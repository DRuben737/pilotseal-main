"use client";

import React, { useEffect, useRef, useState } from 'react';
import Modal from 'react-modal';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import templates from './templates';
import styles from './EndorsementGenerator.module.css';
import { fetchSavedPeople, fetchDefaultCfi, formatStoredDateForDisplay } from '@/lib/saved-people';
import { fetchCurrentProfile } from '@/lib/profile';
import { getSupabaseClient } from '@/lib/supabase';

const FIELD_CONFIG = [
  { key: 'instructorName', label: 'Instructor name', type: 'text', required: true, autoComplete: 'name' },
  { key: 'instructorCertNumber', label: 'Instructor certificate number', type: 'text', required: true, autoComplete: 'off' },
  { key: 'instructorCertExpDate', label: 'Instructor certificate expiration', type: 'text', required: true, autoComplete: 'off', placeholder: 'MM/DD/YYYY', inputMode: 'numeric', maxLength: 10 },
  { key: 'studentName', label: 'Student name', type: 'text', required: true, autoComplete: 'name' },
  { key: 'studentCertNumber', label: 'Student certificate number', type: 'text', required: false, autoComplete: 'off', hideOptionalTag: true },
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
const TEMPLATE_CATEGORY_ORDER = [
  'Solo Endorsements',
  'Other Solo',
  'Solo Cross-Country',
  'Private Pilot',
  'Instrument Rating',
  'Commercial Pilot',
  'CFI',
  'CFII',
  'Sport Pilot',
  'Add Category / Class',
  'Additional Category / Class',
  'Retest / Recurrent / IPC',
  'Aircraft & Operating Endorsements',
  'Other PIC',
];

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
  const explicitCategoryMap = {
    'TSA U.S. Citizenship': null,
    'Pre-Solo Written': 'Solo Endorsements',
    'Pre-Solo Flight Training': 'Solo Endorsements',
    'Pre-Solo Night Training': 'Solo Endorsements',
    'Solo Flight Initial 90 Days': 'Solo Endorsements',
    'Solo Flight Additional 90 Days': 'Solo Endorsements',
    'Solo in other airport': 'Other Solo',
    'Solo airport inside Class B': 'Other Solo',
    'Solo in Class B': 'Other Solo',
    'Solo cross-country training': 'Solo Cross-Country',
    'Solo cross-country plan review': 'Solo Cross-Country',
    'Solo cross-country day': 'Solo Cross-Country',
    'Repeated Solo XC Within 50 NM': 'Solo Cross-Country',
    'PIC Solo Outside Rating': 'Add Category / Class',
    'PVT addon- deficiency': 'Add Category / Class',
    'PVT addon-checkride': 'Add Category / Class',
    'IR addon': 'Add Category / Class',
    'COM addon': 'Add Category / Class',
    'Sport Pilot Proficiency Check': 'Sport Pilot',
    'Sport Pilot Practical Test': 'Sport Pilot',
    'LSA PIC VH <= 87 KCAS': 'Sport Pilot',
    'LSA PIC VH > 87 KCAS': 'Sport Pilot',
    'PVT knowledge test': 'Private Pilot',
    'PVT Written Deficiencies': 'Private Pilot',
    'PVT Practical Test': 'Private Pilot',
    'PVT 2-Month Review': 'Private Pilot',
    'COM knowledge test': 'Commercial Pilot',
    'COM Written Deficiencies': 'Commercial Pilot',
    'COM Practical Test': 'Commercial Pilot',
    'COM 2-Month Review': 'Commercial Pilot',
    'IR knowledge test': 'Instrument Rating',
    'IR Written Deficiencies': 'Instrument Rating',
    'IR Practical Test': 'Instrument Rating',
    'IR 2-Month Review': 'Instrument Rating',
    'FOI knowledge test': 'CFI',
    'CFI Knowledge Test': 'CFI',
    'CFI Knowledge Test Deficiencies': 'CFI',
    'CFII Written Deficiency': 'CFII',
    'CFI required training': 'CFI',
    'Spin training': 'CFI',
    'Helicopter Touchdown Autorotation': 'CFI',
    'CFII Practical Test': 'CFII',
    'Flight review': 'Retest / Recurrent / IPC',
    'Instrument proficiency check': 'Retest / Recurrent / IPC',
    'Ground Instructor Recency': 'Retest / Recurrent / IPC',
    'Written Retest': 'Retest / Recurrent / IPC',
    'Practical Test Retest': 'Retest / Recurrent / IPC',
    'R-22/R-44 Awareness': 'Solo Endorsements',
    'R-22 solo endorsement': 'Solo Endorsements',
    'R-22 PIC': 'Other PIC',
    'R-22 Flight Review': 'Retest / Recurrent / IPC',
    'R-44 solo endorsement': 'Solo Endorsements',
    'R-44 PIC': 'Other PIC',
    'R-44 Flight Review': 'Retest / Recurrent / IPC',
    'Complex Airplane PIC': 'Other PIC',
    'High-Performance Airplane PIC': 'Other PIC',
    'High-Altitude Pressurized PIC': 'Other PIC',
    'Tailwheel Airplane PIC': 'Other PIC',
    'NVG ground training': 'Other PIC',
    'NVG PIC': 'Other PIC',
  };

  if (explicitCategoryMap[title]) {
    return explicitCategoryMap[title];
  }

  if (title in explicitCategoryMap && explicitCategoryMap[title] === null) {
    return null;
  }

  if (/additional category|additional class|category\/class|category and class/i.test(title)) {
    return 'Additional Category / Class';
  }

  return 'Aircraft & Operating Endorsements';
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

function getTrimmedSignatureDataUrl(canvas) {
  if (!canvas) {
    return null;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  const { width, height } = canvas;
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;

  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha === 0) {
        continue;
      }

      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < left || bottom < top) {
    return null;
  }

  const padding = Math.max(4, Math.round(width * 0.01));
  const cropX = Math.max(0, left - padding);
  const cropY = Math.max(0, top - padding);
  const cropWidth = Math.min(width - cropX, right - left + padding * 2);
  const cropHeight = Math.min(height - cropY, bottom - top + padding * 2);

  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = cropWidth;
  trimmedCanvas.height = cropHeight;

  const trimmedContext = trimmedCanvas.getContext('2d');
  if (!trimmedContext) {
    return null;
  }

  trimmedContext.drawImage(
    canvas,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  );

  return trimmedCanvas.toDataURL('image/png');
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
  const [templateCategoryOpen, setTemplateCategoryOpen] = useState({});

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

  const standaloneTemplates = visibleTemplates.filter((template) => template.category === null);

  const groupedVisibleTemplates = visibleTemplates
    .filter((template) => template.category !== null)
    .reduce((accumulator, template) => {
    if (!accumulator[template.category]) {
      accumulator[template.category] = [];
    }

    accumulator[template.category].push(template);
    return accumulator;
  }, {});

  const orderedTemplateGroups = TEMPLATE_CATEGORY_ORDER
    .map((category) => [category, groupedVisibleTemplates[category] || []])
    .filter(([, templatesForCategory]) => templatesForCategory.length > 0);

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

  const toggleTemplateCategory = (category) => {
    setTemplateCategoryOpen((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const handleTemplateCategorySelectAll = (category) => {
    const categoryTitles = (groupedVisibleTemplates[category] || []).map((template) => template.title);
    setSelectedTemplates((prev) => Array.from(new Set([...prev, ...categoryTitles])));
    setErrors((prev) => ({ ...prev, selectedTemplates: undefined }));
  };

  const handleTemplateCategoryClear = (category) => {
    const categoryTitles = new Set(
      (groupedVisibleTemplates[category] || []).map((template) => template.title)
    );
    setSelectedTemplates((prev) => prev.filter((template) => !categoryTitles.has(template)));
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
        const dataUrl = getTrimmedSignatureDataUrl(canvasRef.current);
        if (!dataUrl) {
          throw new Error('Unable to capture the signature image.');
        }
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
              const signatureTargetWidth = 72;
              const signatureTargetHeight = 24;
              const imageRatio = signatureImage.width / signatureImage.height;
              const targetRatio = signatureTargetWidth / signatureTargetHeight;
              const drawWidth = imageRatio > targetRatio
                ? signatureTargetWidth
                : signatureTargetHeight * imageRatio;
              const drawHeight = imageRatio > targetRatio
                ? signatureTargetWidth / imageRatio
                : signatureTargetHeight;

              page.drawImage(signatureImage, {
                x: x + 56,
                y: signatureLabelY - 4,
                width: drawWidth,
                height: drawHeight,
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
        <div className={styles.workspace}>
          <section className={styles.mainPanel}>
            <div className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Information details(* required)</h2>
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

              <div className={styles.formRows}>
                <div className={styles.formRowThree}>
                  {FIELD_CONFIG.slice(0, 3).map((field) => (
                    <label key={field.key} className={styles.field}>
                      <span>
                        {field.label}
                        {field.required ? ' *' : field.hideOptionalTag ? '' : ' (optional)'}
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

                <div className={styles.formRowTwo}>
                  {FIELD_CONFIG.slice(3, 5).map((field) => (
                    <label key={field.key} className={styles.field}>
                      <span>
                        {field.label}
                        {field.required ? ' *' : field.hideOptionalTag ? '' : ' (optional)'}
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

                <div className={styles.formRowDateAction}>
                  <label className={styles.field}>
                    <span>
                      {FIELD_CONFIG[5].label}
                      {FIELD_CONFIG[5].required ? ' *' : ' (optional)'}
                    </span>
                    <input
                      type={FIELD_CONFIG[5].type}
                      value={formData[FIELD_CONFIG[5].key]}
                      onChange={handleChange(FIELD_CONFIG[5].key)}
                      autoComplete={FIELD_CONFIG[5].autoComplete}
                      placeholder={FIELD_CONFIG[5].placeholder}
                      inputMode={FIELD_CONFIG[5].inputMode}
                      maxLength={FIELD_CONFIG[5].maxLength}
                      className={errors[FIELD_CONFIG[5].key] ? styles.fieldError : ''}
                    />
                    {errors[FIELD_CONFIG[5].key] ? <small>{errors[FIELD_CONFIG[5].key]}</small> : null}
                  </label>

                  <div className={styles.inlineActionBlock}>
                    <button className={styles.primaryButton} onClick={openModal} type="button">
                      Select endorsement
                    </button>
                  </div>
                </div>
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

              <div className={styles.actionRow}>
                <button className={styles.secondaryButton} onClick={handlePreview} type="button">
                  Preview
                </button>
                <button className={styles.secondaryButton} onClick={handlePrint} type="button" disabled={!pdfUrl}>
                  Print
                </button>
              </div>

              {errors.selectedTemplates ? <p className={styles.inlineError}>{errors.selectedTemplates}</p> : null}
            </div>
          </section>
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
                      {field.required ? ' *' : field.hideOptionalTag ? '' : ' (optional)'}
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
            {standaloneTemplates.length > 0 ? (
              <div className="endorsementTemplateGrid">
                {standaloneTemplates.map((template) => (
                  <button
                    key={template.title}
                    type="button"
                    className={`endorsementTemplateCard ${template.selected ? 'endorsementTemplateCardSelected' : ''}`}
                    onClick={() => handleTemplateSelection(template.title)}
                    aria-pressed={template.selected}
                  >
                    <div className="endorsementTemplateTop">
                      <span className="endorsementTemplateCategory">Priority</span>
                      <span className="endorsementTemplateToggle">{template.selected ? 'Selected' : 'Add'}</span>
                    </div>
                    <h3>{template.title}</h3>
                    <p className="endorsementTemplatePreview">{template.preview.slice(0, 220)}...</p>
                  </button>
                ))}
              </div>
            ) : null}

            <div className={styles.templateCategoryStack}>
              {orderedTemplateGroups.map(([category, categoryTemplates]) => {
                const selectedCount = categoryTemplates.filter((template) => template.selected).length;
                const isOpen = templateCategoryOpen[category] ?? false;

                return (
                  <section key={category} className={styles.templateCategorySection}>
                    <div className={styles.templateCategoryHeader}>
                      <button
                        type="button"
                        className={styles.templateCategoryToggle}
                        onClick={() => toggleTemplateCategory(category)}
                        aria-expanded={isOpen}
                      >
                        <div>
                          <h3>{category}</h3>
                          <p>
                            {selectedCount} of {categoryTemplates.length} selected
                          </p>
                        </div>
                        <span className={`${styles.templateCategoryChevron} ${isOpen ? styles.templateCategoryChevronOpen : ''}`}>
                          ˅
                        </span>
                      </button>

                      <div className={styles.templateCategoryActions}>
                        <button
                          type="button"
                          className={styles.templateCategoryAction}
                          onClick={() => handleTemplateCategorySelectAll(category)}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          className={styles.templateCategoryAction}
                          onClick={() => handleTemplateCategoryClear(category)}
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {isOpen ? (
                      <div className="endorsementTemplateGrid">
                        {categoryTemplates.map((template) => (
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
                    ) : null}
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default EndorsementGenerator;
