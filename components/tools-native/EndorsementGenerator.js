"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Modal from 'react-modal';
import { useRouter } from 'next/navigation';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import SignaturePad from 'signature_pad';
import templates from './templates';
import styles from './EndorsementGenerator.module.css';
import { useAuthSession } from '@/components/auth/AuthSessionProvider';
import {
  createEndorsementRecord,
  ENDORSEMENT_RECORDS_BUCKET,
} from '@/lib/endorsement-records';
import {
  fetchPersonCertificates,
  getCertificateCurrencyDueDate,
} from '@/lib/person-certificates';
import { fetchSavedPeople, formatStoredDateForDisplay } from '@/lib/saved-people';
import { fetchCurrentProfile } from '@/lib/profile';
import { getSupabaseClient } from '@/lib/supabase';
import { createUuid } from '@/lib/uuid';

const FIELD_CONFIG = [
  { key: 'instructorName', label: 'Instructor name', type: 'text', required: true, autoComplete: 'name' },
  { key: 'instructorCertNumber', label: 'Instructor certificate number', type: 'text', required: true, autoComplete: 'off' },
  { key: 'instructorCertExpDate', label: 'Instructor certificate expiration', type: 'text', required: true, autoComplete: 'off', placeholder: 'MM/DD/YYYY', inputMode: 'numeric', maxLength: 10 },
  { key: 'studentName', label: 'Pilot name', type: 'text', required: true, autoComplete: 'name' },
  { key: 'studentCertNumber', label: 'Pilot certificate number', type: 'text', required: false, autoComplete: 'off', hideOptionalTag: true },
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

function getTodayUsDate() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${month}/${day}/${today.getFullYear()}`;
}

const BASE_FIELD_KEYS = new Set(FIELD_CONFIG.map((field) => field.key));
const BLANK_TEMPLATE_SHORT_FIELDS = new Set([
  'annualReviewDueDate',
  'date',
  'eventDate',
  'instructorCertExpDate',
]);
const BLANK_TEMPLATE_MEDIUM_FIELDS = new Set([
  'citizenshipDocumentNumber',
  'instructorCertNumber',
  'studentCertNumber',
]);
const LETTER_PAGE_WIDTH = 612;
const LETTER_PAGE_HEIGHT = 792;
const AVERY_5163_LABEL_WIDTH = 288;
const AVERY_5163_LABEL_HEIGHT = 144;
const AVERY_5163_COLUMNS = 2;
const AVERY_5163_ROWS = 5;
const AVERY_5163_LABELS_PER_PAGE = AVERY_5163_COLUMNS * AVERY_5163_ROWS;
const AVERY_5163_SIDE_MARGIN = 11.25;
const AVERY_5163_TOP_MARGIN = 36;
const AVERY_5163_COLUMN_GAP = 13.5;
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

function getInstructorExpirationDate(certificate, person) {
  if (person.cert_exp_date) {
    return person.cert_exp_date;
  }

  const dueDate = getCertificateCurrencyDueDate(certificate);
  if (!dueDate) {
    return '';
  }

  return [
    String(dueDate.getMonth() + 1).padStart(2, '0'),
    String(dueDate.getDate()).padStart(2, '0'),
    String(dueDate.getFullYear()).padStart(4, '0'),
  ].join('/');
}

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
  const normalizedTitle = String(title || '').trim().replace(/\s+/g, ' ');
  const explicitCategoryMap = {
    'TSA U.S. Citizenship': null,
    'Pre-Solo Written': 'Solo Endorsements',
    'Pre-Solo Flight Training': 'Solo Endorsements',
    'Pre-Solo Night Training': 'Other Solo',
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

  if (
    /pre-solo night training/i.test(normalizedTitle) ||
    /solo airport inside class b/i.test(normalizedTitle) ||
    /solo in class b/i.test(normalizedTitle) ||
    /solo in other airport/i.test(normalizedTitle)
  ) {
    return 'Other Solo';
  }

  if (explicitCategoryMap[normalizedTitle]) {
    return explicitCategoryMap[normalizedTitle];
  }

  if (normalizedTitle in explicitCategoryMap && explicitCategoryMap[normalizedTitle] === null) {
    return null;
  }

  if (/additional category|additional class|category\/class|category and class/i.test(normalizedTitle)) {
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

function getSavedPeopleByName(options, value) {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) {
    return [];
  }

  return options.filter((person) => person.display_name?.trim().toLowerCase() === normalizedValue);
}

function getCertificateOptionsForName(options, value) {
  const exactMatches = getSavedPeopleByName(options, value);
  if (exactMatches.length > 0) {
    return exactMatches;
  }

  return options;
}

function getUniqueSavedPeopleByName(options) {
  const seen = new Set();

  return options.filter((person) => {
    const normalizedName = person.display_name?.trim().toLowerCase();
    if (!normalizedName || seen.has(normalizedName)) {
      return false;
    }

    seen.add(normalizedName);
    return true;
  });
}

function getUniqueSavedPeopleByCertificateNumber(options) {
  const seen = new Set();

  return options.filter((person) => {
    const normalizedCertificateNumber = person.cert_number?.trim().toLowerCase();
    if (!normalizedCertificateNumber || seen.has(normalizedCertificateNumber)) {
      return false;
    }

    seen.add(normalizedCertificateNumber);
    return true;
  });
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

function getBlankTemplateValue(key) {
  if (BLANK_TEMPLATE_SHORT_FIELDS.has(key) || key.toLowerCase().includes('date')) {
    return '____________';
  }

  if (
    BLANK_TEMPLATE_MEDIUM_FIELDS.has(key) ||
    key.toLowerCase().includes('number') ||
    key.toLowerCase().includes('certificate')
  ) {
    return '____________________';
  }

  return '______________________________';
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

function clearCanvas(canvas) {
  if (!canvas) {
    return;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
}

function resizeSignaturePadCanvas(canvas, signaturePad) {
  if (!canvas) {
    return;
  }

  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const existingData = signaturePad && !signaturePad.isEmpty() ? signaturePad.toData() : null;

  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.getContext('2d')?.scale(ratio, ratio);

  if (!signaturePad) {
    return;
  }

  signaturePad.clear();
  if (existingData) {
    signaturePad.fromData(existingData);
  }
}

function drawSignatureDataUrlToCanvas(canvas, dataUrl) {
  if (!canvas || !dataUrl) {
    return;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const image = new Image();
  image.onload = () => {
    const imageRatio = image.width / image.height;
    const canvasRatio = canvas.width / canvas.height;
    const drawWidth = imageRatio > canvasRatio ? canvas.width * 0.86 : canvas.height * 0.58 * imageRatio;
    const drawHeight = imageRatio > canvasRatio ? drawWidth / imageRatio : canvas.height * 0.58;
    const x = (canvas.width - drawWidth) / 2;
    const y = (canvas.height - drawHeight) / 2;

    context.drawImage(image, x, y, drawWidth, drawHeight);
  };
  image.src = dataUrl;
}

function initializeRotatedSignatureCanvas(canvas, { dataUrl, onBegin, onEnd }) {
  if (!canvas) {
    return undefined;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    return undefined;
  }

  const resizeCanvas = () => {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const localWidth = Math.max(1, rect.height);
    const localHeight = Math.max(1, rect.width);
    const currentDataUrl = getTrimmedSignatureDataUrl(canvas) || dataUrl;

    canvas.width = localWidth * ratio;
    canvas.height = localHeight * ratio;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.lineWidth = 3.2 * ratio;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f172a';
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawSignatureDataUrlToCanvas(canvas, currentDataUrl);
  };

  resizeCanvas();

  let drawing = false;

  const getPoint = (event) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.height);
    const scaleY = canvas.height / Math.max(1, rect.width);

    return {
      x: Math.max(0, Math.min(canvas.width, (event.clientY - rect.top) * scaleX)),
      y: Math.max(0, Math.min(canvas.height, (rect.right - event.clientX) * scaleY)),
    };
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    drawing = true;
    onBegin?.();
    canvas.setPointerCapture?.(event.pointerId);
    const { x, y } = getPoint(event);
    context.beginPath();
    context.moveTo(x, y);
  };

  const handlePointerMove = (event) => {
    if (!drawing) {
      return;
    }

    event.preventDefault();
    const { x, y } = getPoint(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const handlePointerUp = () => {
    if (!drawing) {
      return;
    }

    drawing = false;
    context.closePath();
    onEnd?.();
  };

  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerUp);
  canvas.addEventListener('pointerleave', handlePointerUp);
  window.addEventListener('resize', resizeCanvas);

  return () => {
    canvas.removeEventListener('pointerdown', handlePointerDown);
    canvas.removeEventListener('pointermove', handlePointerMove);
    canvas.removeEventListener('pointerup', handlePointerUp);
    canvas.removeEventListener('pointercancel', handlePointerUp);
    canvas.removeEventListener('pointerleave', handlePointerUp);
    window.removeEventListener('resize', resizeCanvas);
  };
}

function createSignaturePad(canvas, { onBegin, onEnd } = {}) {
  if (!canvas) {
    return null;
  }

  const signaturePad = new SignaturePad(canvas, {
    backgroundColor: 'rgba(255,255,255,0)',
    penColor: '#0f172a',
    minWidth: 1.2,
    maxWidth: 3.2,
    throttle: 8,
  });

  resizeSignaturePadCanvas(canvas, signaturePad);

  if (onBegin) {
    signaturePad.addEventListener('beginStroke', onBegin);
  }

  if (onEnd) {
    signaturePad.addEventListener('endStroke', onEnd);
  }

  return signaturePad;
}

async function requestFullscreenAndLandscape(element) {
  const orientation = window.screen?.orientation;

  try {
    if (element?.requestFullscreen) {
      await element.requestFullscreen();
    }
  } catch {
    // Fullscreen is best-effort on mobile browsers.
  }

  try {
    await orientation?.lock?.('landscape');
  } catch {
    // iOS Safari and some embedded browsers do not support orientation lock.
  }
}

function EndorsementGenerator() {
  const router = useRouter();
  const { session } = useAuthSession();
  const [formData, setFormData] = useState(() => ({
    ...INITIAL_FORM_DATA,
    date: getTodayUsDate(),
  }));
  const [errors, setErrors] = useState({});
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [detailsModalIsOpen, setDetailsModalIsOpen] = useState(false);
  const [guestRegisterPromptOpen, setGuestRegisterPromptOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [latestPdfBlob, setLatestPdfBlob] = useState(null);
  const [savingRecord, setSavingRecord] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printFormat, setPrintFormat] = useState('letter');
  const [labelStartSlot, setLabelStartSlot] = useState('1');
  const [printablePdfUrl, setPrintablePdfUrl] = useState('');
  const [generatorMode, setGeneratorMode] = useState('customized');
  const [selectedTemplates, setSelectedTemplates] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusMessage, setStatusMessage] = useState('Fill the form, select endorsements, then preview to confirm and open the PDF packet.');
  const [templateFieldData, setTemplateFieldData] = useState({});
  const [activeSuggestionField, setActiveSuggestionField] = useState('');
  const [sessionIdentity, setSessionIdentity] = useState('');
  const [savedCfis, setSavedCfis] = useState([]);
  const [savedStudents, setSavedStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [templateCategoryOpen, setTemplateCategoryOpen] = useState({});
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [signaturePreviewDataUrl, setSignaturePreviewDataUrl] = useState('');
  const [isMobileSignatureDevice, setIsMobileSignatureDevice] = useState(false);
  const [isRotatedSignatureMode, setIsRotatedSignatureMode] = useState(false);

  const canvasRef = useRef(null);
  const mobileSignatureCanvasRef = useRef(null);
  const signatureModalOverlayRef = useRef(null);
  const desktopSignaturePadRef = useRef(null);
  const mobileSignaturePadRef = useRef(null);
  const signatureDirtyRef = useRef(false);
  const pdfUrlRef = useRef('');
  const printablePdfUrlRef = useRef('');
  const printablePdfIsTemporaryRef = useRef(false);
  const printFrameRef = useRef(null);
  const defaultCfiAppliedRef = useRef(false);

  const resetGeneratedPdf = useCallback(() => {
    if (printablePdfIsTemporaryRef.current && printablePdfUrlRef.current) {
      URL.revokeObjectURL(printablePdfUrlRef.current);
    }
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = '';
    }
    setPdfUrl('');
    setLatestPdfBlob(null);
    setPrintablePdfUrl('');
    printablePdfUrlRef.current = '';
    printablePdfIsTemporaryRef.current = false;
  }, []);

  useEffect(() => {
    Modal.setAppElement(document.body);
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(hover: none), (pointer: coarse)');
    const portraitQuery = window.matchMedia('(orientation: portrait)');
    const syncMobileSignatureMode = () => {
      setIsMobileSignatureDevice(query.matches);
      setIsRotatedSignatureMode(query.matches && portraitQuery.matches);
    };

    syncMobileSignatureMode();
    query.addEventListener?.('change', syncMobileSignatureMode);
    portraitQuery.addEventListener?.('change', syncMobileSignatureMode);

    return () => {
      query.removeEventListener?.('change', syncMobileSignatureMode);
      portraitQuery.removeEventListener?.('change', syncMobileSignatureMode);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const signaturePad = createSignaturePad(canvas, {
      onBegin: () => {
        resetGeneratedPdf();
        setSignaturePreviewDataUrl('');
      },
      onEnd: () => {
        signatureDirtyRef.current = true;
      },
    });

    desktopSignaturePadRef.current = signaturePad;

    const handleResize = () => {
      resizeSignaturePadCanvas(canvas, signaturePad);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      signaturePad?.off();
      desktopSignaturePadRef.current = null;
    };
  }, [resetGeneratedPdf]);

  useEffect(() => {
    if (!signatureModalOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const overlay = signatureModalOverlayRef.current;

    void requestFullscreenAndLandscape(overlay);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.screen?.orientation?.unlock?.();
      if (document.fullscreenElement === overlay) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
  }, [signatureModalOpen]);

  useEffect(() => {
    if (!signatureModalOpen) {
      return undefined;
    }

    const canvas = mobileSignatureCanvasRef.current;
    if (isRotatedSignatureMode) {
      const cleanup = initializeRotatedSignatureCanvas(canvas, {
        dataUrl: signaturePreviewDataUrl,
        onBegin: () => {
          resetGeneratedPdf();
        },
        onEnd: () => {
          signatureDirtyRef.current = true;
        },
      });

      mobileSignaturePadRef.current = null;

      return cleanup;
    }

    const signaturePad = createSignaturePad(canvas);
    mobileSignaturePadRef.current = signaturePad;

    const loadSavedSignature = () => {
      if (signaturePreviewDataUrl && signaturePad) {
        signaturePad.fromDataURL(signaturePreviewDataUrl).catch(() => {});
      }
    };

    const handleResize = () => {
      resizeSignaturePadCanvas(canvas, signaturePad);
      loadSavedSignature();
    };

    loadSavedSignature();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      signaturePad?.off();
      mobileSignaturePadRef.current = null;
    };
  }, [isRotatedSignatureMode, resetGeneratedPdf, signatureModalOpen, signaturePreviewDataUrl]);

  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
      }
      if (printablePdfIsTemporaryRef.current && printablePdfUrlRef.current) {
        URL.revokeObjectURL(printablePdfUrlRef.current);
      }
      printFrameRef.current?.remove();
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

        const [allPeople, profile] = await Promise.all([
          fetchSavedPeople(session.user.id),
          fetchCurrentProfile(session.user.id),
        ]);

        const certificates = await fetchPersonCertificates(session.user.id).catch((error) => {
          console.error('Unable to load person certificates:', error);
          return [];
        });
        const peopleById = new Map(allPeople.map((person) => [person.id, person]));
        const selfPersonId = profile?.self_person_id || '';
        const certificateCfis = certificates
          .filter((certificate) => (
            certificate.person_id === selfPersonId &&
            (
              certificate.certificate_type === 'flight_instructor' ||
              certificate.certificate_type === 'ground_instructor'
            )
          ))
          .map((certificate) => {
            const person = peopleById.get(certificate.person_id);
            if (!person) {
              return null;
            }

            return {
              ...person,
              id: certificate.id,
              person_id: person.id,
              cert_number: certificate.certificate_number || person.cert_number,
              cert_exp_date: getInstructorExpirationDate(certificate, person),
              is_default: certificate.is_default_for_endorsements || person.is_default,
            };
          })
          .filter(Boolean)
          .sort((left, right) => Number(right.is_default) - Number(left.is_default));
        const certificatePilots = certificates
          .filter((certificate) => certificate.certificate_type === 'pilot' && certificate.person_id !== selfPersonId)
          .map((certificate) => {
            const person = peopleById.get(certificate.person_id);
            if (!person) {
              return null;
            }

            return {
              ...person,
              id: certificate.id,
              person_id: person.id,
              cert_number: certificate.certificate_number || person.cert_number,
            };
          })
          .filter(Boolean);
        const pilotCertificatePersonIds = new Set(
          certificatePilots.map((person) => person.person_id)
        );
        const savedStudentPeople = allPeople.filter((person) => (
          person.role === 'student' &&
          person.id !== selfPersonId &&
          !pilotCertificatePersonIds.has(person.id)
        ));

        setSavedCfis(certificateCfis);
        setSavedStudents([...certificatePilots, ...savedStudentPeople]);
        setSessionIdentity(profile?.display_name || session.user.email || '');

        const defaultCertificateCfi = certificateCfis.find((person) => person.is_default);
        const preferredCfi = defaultCertificateCfi || certificateCfis[0];

        if (preferredCfi && !defaultCfiAppliedRef.current) {
          setFormData((prev) => ({
            ...prev,
            instructorName: prev.instructorName.trim() ? prev.instructorName : preferredCfi.display_name || '',
            instructorCertNumber: prev.instructorCertNumber.trim()
              ? prev.instructorCertNumber
              : preferredCfi.cert_number || '',
            instructorCertExpDate: prev.instructorCertExpDate.trim()
              ? prev.instructorCertExpDate
              : formatStoredDateForDisplay(preferredCfi.cert_exp_date) || '',
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
        String(template.category || '').toLowerCase().includes(query) ||
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
    desktopSignaturePadRef.current?.clear();
    mobileSignaturePadRef.current?.clear();
    clearCanvas(canvasRef.current);
    clearCanvas(mobileSignatureCanvasRef.current);
    signatureDirtyRef.current = false;
    setSignaturePreviewDataUrl('');
    resetGeneratedPdf();
    setStatusMessage('Signature cleared.');
  };

  const openSignatureModal = () => {
    setSignatureModalOpen(true);
  };

  const closeSignatureModal = () => {
    setSignatureModalOpen(false);
  };

  const confirmMobileSignature = () => {
    const mobileSignaturePad = mobileSignaturePadRef.current;
    const dataUrl = getTrimmedSignatureDataUrl(mobileSignatureCanvasRef.current) || signaturePreviewDataUrl;

    if ((!mobileSignaturePad || mobileSignaturePad.isEmpty()) && !dataUrl) {
      clearSignature();
      setSignatureModalOpen(false);
      return;
    }

    if (!dataUrl) {
      clearSignature();
      setSignatureModalOpen(false);
      return;
    }

    signatureDirtyRef.current = true;
    setSignaturePreviewDataUrl(dataUrl);
    resetGeneratedPdf();
    setSignatureModalOpen(false);
    setStatusMessage('Signature saved. Preview the PDF again to include the updated signature.');
  };

  const clearMobileSignature = () => {
    mobileSignaturePadRef.current?.clear();
    desktopSignaturePadRef.current?.clear();
    clearCanvas(mobileSignatureCanvasRef.current);
    clearCanvas(canvasRef.current);
    signatureDirtyRef.current = false;
    setSignaturePreviewDataUrl('');
    resetGeneratedPdf();
    setStatusMessage('Signature cleared. PDF generation will leave the signature area blank.');
  };

  const openModal = () => setModalIsOpen(true);
  const closeModal = () => setModalIsOpen(false);
  const openDetailsModal = () => setDetailsModalIsOpen(true);
  const closeDetailsModal = () => setDetailsModalIsOpen(false);
  const handleGeneratorModeChange = (nextMode) => {
    resetGeneratedPdf();
    setGeneratorMode(nextMode);
    setDetailsModalIsOpen(false);
    setErrors({});
    setStatusMessage(
      nextMode === 'blank'
        ? 'Select blank endorsement templates, then preview the reusable PDF before printing.'
        : 'Fill the form, select endorsements, then preview to confirm and open the PDF packet.'
    );
  };
  const handleChange = (field) => (event) => {
    const nextValue = formatInputValue(field, event.target.value);
    resetGeneratedPdf();
    setFormData((prev) => {
      const nextForm = { ...prev, [field]: nextValue };

      if (field === 'instructorName') {
        const matchingCertificates = getSavedPeopleByName(savedCfis, nextValue);
        if (matchingCertificates.length === 1) {
          const [selected] = matchingCertificates;
          nextForm.instructorCertNumber = selected.cert_number || '';
          nextForm.instructorCertExpDate = formatStoredDateForDisplay(selected.cert_exp_date) || '';
        } else if (matchingCertificates.length > 1) {
          const currentCertNumber = prev.instructorCertNumber.trim().toLowerCase();
          const selected = matchingCertificates.find(
            (person) => (person.cert_number || '').trim().toLowerCase() === currentCertNumber
          );

          if (selected) {
            nextForm.instructorCertNumber = selected.cert_number || '';
            nextForm.instructorCertExpDate = formatStoredDateForDisplay(selected.cert_exp_date) || '';
          } else {
            nextForm.instructorCertNumber = '';
            nextForm.instructorCertExpDate = '';
          }
        }
      }

      if (field === 'instructorCertNumber') {
        const selected = getSavedPeopleByName(savedCfis, nextForm.instructorName).find(
          (person) => (person.cert_number || '').trim().toLowerCase() === nextValue.trim().toLowerCase()
        );

        if (selected) {
          nextForm.instructorCertExpDate = formatStoredDateForDisplay(selected.cert_exp_date) || '';
        }
      }

      if (field === 'studentName') {
        const matchingCertificates = getSavedPeopleByName(savedStudents, nextValue);
        const selected = matchingCertificates.length === 1
          ? matchingCertificates[0]
          : matchingCertificates.find(
              (person) => (
                person.cert_number || ''
              ).trim().toLowerCase() === prev.studentCertNumber.trim().toLowerCase()
            );

        setSelectedStudentId(selected?.person_id || selected?.id || '');
        if (selected && matchingCertificates.length === 1) {
          nextForm.studentCertNumber = selected.cert_number || '';
        } else if (matchingCertificates.length > 1 && !selected) {
          nextForm.studentCertNumber = '';
        }
      }

      if (field === 'studentCertNumber') {
        const selected = getCertificateOptionsForName(savedStudents, nextForm.studentName).find(
          (person) => (person.cert_number || '').trim().toLowerCase() === nextValue.trim().toLowerCase()
        );

        setSelectedStudentId(selected?.person_id || selected?.id || '');
      }

      return nextForm;
    });
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSavedPersonSuggestion = (field, person) => {
    resetGeneratedPdf();
    setActiveSuggestionField('');
    setFormData((prev) => {
      const nextForm = { ...prev };

      if (field === 'instructorName') {
        const nextName = person.display_name || '';
        nextForm.instructorName = nextName;
        const matchingCertificates = getSavedPeopleByName(savedCfis, nextName);

        if (matchingCertificates.length === 1) {
          const [selected] = matchingCertificates;
          nextForm.instructorCertNumber = selected.cert_number || '';
          nextForm.instructorCertExpDate = formatStoredDateForDisplay(selected.cert_exp_date) || '';
        } else if (matchingCertificates.length > 1) {
          const selected = matchingCertificates.find(
            (certificate) => (
              certificate.cert_number || ''
            ).trim().toLowerCase() === prev.instructorCertNumber.trim().toLowerCase()
          );

          nextForm.instructorCertNumber = selected?.cert_number || '';
          nextForm.instructorCertExpDate = selected ? formatStoredDateForDisplay(selected.cert_exp_date) || '' : '';
        }
      }

      if (field === 'instructorCertNumber') {
        nextForm.instructorName = person.display_name || nextForm.instructorName;
        nextForm.instructorCertNumber = person.cert_number || '';
        nextForm.instructorCertExpDate = formatStoredDateForDisplay(person.cert_exp_date) || '';
      }

      if (field === 'studentName') {
        const nextName = person.display_name || '';
        nextForm.studentName = nextName;
        const matchingCertificates = getSavedPeopleByName(savedStudents, nextName);
        const selected = matchingCertificates.length === 1 ? matchingCertificates[0] : null;

        setSelectedStudentId(selected?.person_id || selected?.id || '');
        nextForm.studentCertNumber = selected?.cert_number || '';
      }

      if (field === 'studentCertNumber') {
        nextForm.studentName = person.display_name || nextForm.studentName;
        nextForm.studentCertNumber = person.cert_number || '';
        setSelectedStudentId(person.person_id || person.id || '');
      }

      return nextForm;
    });
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleDynamicFieldChange = (field) => (event) => {
    const nextValue = field.type === 'multi-select'
      ? Array.from(event.target.selectedOptions, (option) => option.value)
      : event.target.value;

    resetGeneratedPdf();
    setTemplateFieldData((prev) => ({ ...prev, [field.key]: nextValue }));
    setErrors((prev) => ({ ...prev, [field.key]: undefined }));
  };

  const handleMultiSelectToggle = (fieldKey, option) => {
    resetGeneratedPdf();
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

    resetGeneratedPdf();
    setSelectedTemplates(nextSelected);

    setErrors((prev) => ({ ...prev, selectedTemplates: undefined }));

    if (generatorMode === 'customized' && !isAlreadySelected) {
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
    resetGeneratedPdf();
    setSelectedTemplates((prev) => Array.from(new Set([...prev, ...categoryTitles])));
    setErrors((prev) => ({ ...prev, selectedTemplates: undefined }));
  };

  const handleTemplateCategoryClear = (category) => {
    const categoryTitles = new Set(
      (groupedVisibleTemplates[category] || []).map((template) => template.title)
    );
    resetGeneratedPdf();
    setSelectedTemplates((prev) => prev.filter((template) => !categoryTitles.has(template)));
  };

  const validateForm = () => {
    const nextErrors = {};
    let hasTemplateFieldErrors = false;

    if (generatorMode === 'customized') {
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
    }

    if (formData.instructorCertExpDate && !/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/.test(formData.instructorCertExpDate)) {
      nextErrors.instructorCertExpDate = 'Use MM/DD/YYYY';
    }

    if (generatorMode === 'customized' && formData.date && !/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/.test(formData.date)) {
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
    const blankTemplateMappedData = {
      studentName: getBlankTemplateValue('studentName'),
      studentCertNumber: getBlankTemplateValue('studentCertNumber'),
      date: getBlankTemplateValue('date'),
      instructorName: formData.instructorName.trim() || getBlankTemplateValue('instructorName'),
      instructorCertNumber: formData.instructorCertNumber.trim() || getBlankTemplateValue('instructorCertNumber'),
      instructorCertExpDate:
        formatDateForPdf(formData.instructorCertExpDate) || getBlankTemplateValue('instructorCertExpDate'),
    };
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
    const nextMappedData = generatorMode === 'blank' ? blankTemplateMappedData : mappedData;

    return sanitizeText(
      Object.entries(nextMappedData).reduce(
        (content, [token, value]) => content.replaceAll(`{${token}}`, value),
        template.text
      ).replace(/\{([^}]+)\}/g, (_, token) => (
        generatorMode === 'blank' ? getBlankTemplateValue(token) : `{${token}}`
      ))
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
      const pageWidth = LETTER_PAGE_WIDTH;
      const pageHeight = LETTER_PAGE_HEIGHT;
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
        const dataUrl = signaturePreviewDataUrl || getTrimmedSignatureDataUrl(canvasRef.current);
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
      setLatestPdfBlob(blob);
      setStatusMessage(`PDF ready. Generated ${selectedTemplates.length} endorsement draft(s).`);
      return { url: nextPdfUrl, blob };
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
      generatorMode === 'blank'
        ? `Preview ${selectedTemplates.length} reusable blank endorsement template(s)?`
        : `Preview ${selectedTemplates.length} endorsement draft(s)?\n\nInstructor: ${formData.instructorName.trim()}\nStudent: ${formData.studentName.trim()}\nDate: ${formatDateForPdf(formData.date)}`
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

    const nextPdf = await buildPdfUrl();
    if (!nextPdf) {
      previewWindow.close();
      return;
    }

    previewWindow.location.href = nextPdf.url;

    if (generatorMode === 'customized' && !session?.user?.id) {
      setGuestRegisterPromptOpen(true);
    }
  };

  const savePrintedRecord = async (pdfBlob) => {
    if (!session?.user?.id || !pdfBlob) {
      return;
    }

    setSavingRecord(true);

    try {
      const recordId = createUuid();
      const storagePath = `${session.user.id}/${recordId}.pdf`;
      const supabase = getSupabaseClient();

      const { error: uploadError } = await supabase.storage
        .from(ENDORSEMENT_RECORDS_BUCKET)
        .upload(storagePath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      await createEndorsementRecord({
        id: recordId,
        userId: session.user.id,
        studentId: selectedStudentId || null,
        studentName: formData.studentName.trim(),
        studentCertNumber: formData.studentCertNumber.trim() || null,
        instructorName: formData.instructorName.trim(),
        instructorCertNumber: formData.instructorCertNumber.trim() || null,
        endorsementDate: formatDateForPdf(formData.date),
        templateTitles: selectedTemplates,
        storagePath,
        fileSizeBytes: pdfBlob.size,
      });

      setStatusMessage('Print window opened. The PDF was saved to your dashboard records.');
    } catch (error) {
      console.error('Error saving endorsement record:', error);
      setStatusMessage('Print window opened, but the PDF could not be saved to your dashboard records.');
    } finally {
      setSavingRecord(false);
    }
  };

  const handlePrint = () => {
    if (!pdfUrl) {
      setStatusMessage('Open a preview first to generate the PDF before printing.');
      return;
    }

    setPrintModalOpen(true);
  };

  const buildAvery5163PdfUrl = async () => {
    if (!validateForm()) {
      setStatusMessage('Resolve the highlighted fields before printing Avery 5163 labels.');
      return null;
    }

    try {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const labelPaddingX = 6;
      const labelPaddingTop = 6;
      const labelPaddingBottom = 6;
      const signatureDrop = 18;
      const signatureAreaHeight = 30;
      const textWidth = AVERY_5163_LABEL_WIDTH - labelPaddingX * 2;
      const maxTextHeight =
        AVERY_5163_LABEL_HEIGHT - labelPaddingTop - labelPaddingBottom - signatureAreaHeight;
      const startIndex = Number.parseInt(labelStartSlot, 10) - 1;
      let signatureImage;

      if (signatureDirtyRef.current) {
        const dataUrl = signaturePreviewDataUrl || getTrimmedSignatureDataUrl(canvasRef.current);
        if (!dataUrl) {
          throw new Error('Unable to capture the signature image.');
        }
        const signatureImageBytes = await fetch(dataUrl).then((response) => response.arrayBuffer());
        signatureImage = await doc.embedPng(signatureImageBytes);
      }

      const labels = selectedTemplates.map((templateKey) => {
        const content = createTemplateDraft(templateKey);

        for (let fontSize = 7; fontSize >= 5.5; fontSize -= 0.25) {
          const lineHeight = fontSize * 1.15;
          const lines = splitTextIntoLines(content, font, fontSize, textWidth);

          if (lines.length * lineHeight <= maxTextHeight) {
            return { lines, fontSize, lineHeight };
          }
        }

        throw new Error(`"${templateKey}" is too long for an Avery 5163 label. Use standard Letter paper.`);
      });
      const requiredSlots = startIndex + labels.length;
      const pageCount = Math.ceil(requiredSlots / AVERY_5163_LABELS_PER_PAGE);

      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        const page = doc.addPage([LETTER_PAGE_WIDTH, LETTER_PAGE_HEIGHT]);

        for (let slot = 0; slot < AVERY_5163_LABELS_PER_PAGE; slot += 1) {
          const labelIndex = pageIndex * AVERY_5163_LABELS_PER_PAGE + slot - startIndex;
          const label = labels[labelIndex];
          if (!label) {
            continue;
          }

          const column = slot % AVERY_5163_COLUMNS;
          const row = Math.floor(slot / AVERY_5163_COLUMNS);
          const x = AVERY_5163_SIDE_MARGIN + column * (AVERY_5163_LABEL_WIDTH + AVERY_5163_COLUMN_GAP);
          const y = LETTER_PAGE_HEIGHT - AVERY_5163_TOP_MARGIN - (row + 1) * AVERY_5163_LABEL_HEIGHT;
          let textY = y + AVERY_5163_LABEL_HEIGHT - labelPaddingTop - label.fontSize;

          label.lines.forEach((line) => {
            page.drawText(line, {
              x: x + labelPaddingX,
              y: textY,
              size: label.fontSize,
              font,
            });
            textY -= label.lineHeight;
          });

          const signatureLabelY = textY - signatureDrop - 2;
          page.drawText('Signature:', {
            x: x + labelPaddingX,
            y: signatureLabelY,
            size: label.fontSize,
            font,
          });

          if (signatureImage) {
            const signatureTargetWidth = 60;
            const signatureTargetHeight = signatureDrop;
            const imageRatio = signatureImage.width / signatureImage.height;
            const targetRatio = signatureTargetWidth / signatureTargetHeight;
            const drawWidth = imageRatio > targetRatio
              ? signatureTargetWidth
              : signatureTargetHeight * imageRatio;
            const drawHeight = imageRatio > targetRatio
              ? signatureTargetWidth / imageRatio
              : signatureTargetHeight;

            page.drawImage(signatureImage, {
              x: x + 48,
              y: signatureLabelY - 3,
              width: drawWidth,
              height: drawHeight,
            });
          } else {
            page.drawLine({
              start: { x: x + 48, y: signatureLabelY + 2 },
              end: { x: x + 126, y: signatureLabelY + 2 },
              thickness: 1,
              color: rgb(0.15, 0.23, 0.33),
            });
          }
        }
      }

      const pdfBytes = await doc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      return { url: URL.createObjectURL(blob), blob };
    } catch (error) {
      console.error('Error generating Avery 5163 PDF:', error);
      setStatusMessage(error instanceof Error ? error.message : 'Failed to generate Avery 5163 labels.');
      return null;
    }
  };

  const rememberPrintablePdf = (url, isTemporary) => {
    if (
      printablePdfIsTemporaryRef.current &&
      printablePdfUrlRef.current &&
      printablePdfUrlRef.current !== url
    ) {
      URL.revokeObjectURL(printablePdfUrlRef.current);
    }

    printablePdfUrlRef.current = url;
    printablePdfIsTemporaryRef.current = isTemporary;
    setPrintablePdfUrl(url);
  };

  const requestPrintDialog = (url) => {
    printFrameRef.current?.remove();

    const frame = document.createElement('iframe');
    frame.title = 'PilotSeal printable PDF';
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.border = '0';
    frame.style.opacity = '0';
    frame.setAttribute('aria-hidden', 'true');

    const cleanup = () => {
      if (printFrameRef.current === frame) {
        printFrameRef.current = null;
      }
      frame.remove();
    };

    frame.onload = () => {
      window.setTimeout(() => {
        try {
          const printableWindow = frame.contentWindow;
          if (!printableWindow) {
            throw new Error('Printable PDF window is unavailable.');
          }

          printableWindow.addEventListener('afterprint', cleanup, { once: true });
          printableWindow.focus();
          printableWindow.print();
          setStatusMessage('Print dialog requested. If it does not open, use Open printable PDF below.');
        } catch (error) {
          console.error('Unable to open the print dialog:', error);
          cleanup();
          setStatusMessage('The browser did not open the print dialog. Open the printable PDF and use the print button in the PDF viewer.');
        }
      }, 250);
    };
    frame.onerror = () => {
      cleanup();
      setStatusMessage('The browser did not open the print dialog. Open the printable PDF and use the print button in the PDF viewer.');
    };

    printFrameRef.current = frame;
    frame.src = url;
    document.body.appendChild(frame);
    window.setTimeout(cleanup, 60_000);
  };

  const handlePrintFormatConfirm = async () => {
    setPrintModalOpen(false);

    const printablePdf = printFormat === 'avery-5163'
      ? await buildAvery5163PdfUrl()
      : { url: pdfUrl, blob: latestPdfBlob };

    if (!printablePdf?.url || !printablePdf.blob) {
      return;
    }

    rememberPrintablePdf(printablePdf.url, printFormat === 'avery-5163');
    requestPrintDialog(printablePdf.url);

    if (generatorMode === 'customized' && session?.user?.id) {
      void savePrintedRecord(printablePdf.blob);
    }
  };

  const handleOpenPrintablePdf = () => {
    if (!printablePdfUrl) {
      return;
    }

    const printableWindow = window.open(printablePdfUrl, '_blank');
    if (!printableWindow) {
      setStatusMessage('The printable PDF window was blocked by the browser.');
    }
  };

  const savedInstructorNameOptions = getUniqueSavedPeopleByName(savedCfis);
  const savedPilotNameOptions = getUniqueSavedPeopleByName(savedStudents);
  const uniqueMatchingInstructorCertificates = getUniqueSavedPeopleByCertificateNumber(
    savedCfis
  );
  const uniqueMatchingPilotCertificates = getUniqueSavedPeopleByCertificateNumber(
    savedStudents
  );
  const getSuggestionOptions = (fieldKey) => {
    if (!sessionIdentity) {
      return [];
    }

    if (fieldKey === 'instructorName') {
      return savedInstructorNameOptions;
    }

    if (fieldKey === 'instructorCertNumber') {
      return uniqueMatchingInstructorCertificates;
    }

    if (fieldKey === 'studentName') {
      return savedPilotNameOptions;
    }

    if (fieldKey === 'studentCertNumber') {
      return uniqueMatchingPilotCertificates;
    }

    return [];
  };

  const getSuggestionLabel = (fieldKey, person) => (
    fieldKey === 'instructorCertNumber' || fieldKey === 'studentCertNumber'
      ? person.cert_number
      : person.display_name
  );

  const renderFieldInput = (field) => {
    const suggestionOptions = getSuggestionOptions(field.key);
    const hasSuggestions = suggestionOptions.length > 0;
    const isSuggestionOpen = activeSuggestionField === field.key && hasSuggestions;

    return (
      <div className={hasSuggestions ? styles.comboField : undefined}>
        <input
          type={field.type}
          value={formData[field.key]}
          onChange={handleChange(field.key)}
          onFocus={() => {
            if (hasSuggestions) {
              setActiveSuggestionField(field.key);
            }
          }}
          onBlur={() => window.setTimeout(() => setActiveSuggestionField(''), 120)}
          autoComplete={field.autoComplete}
          placeholder={field.placeholder}
          inputMode={field.inputMode}
          maxLength={field.maxLength}
          className={errors[field.key] ? styles.fieldError : ''}
        />
        {hasSuggestions ? (
          <button
            type="button"
            className={styles.comboToggle}
            aria-label={`Show ${field.label} options`}
            title={`Show ${field.label} options`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setActiveSuggestionField((current) => (
              current === field.key ? '' : field.key
            ))}
          >
            ▾
          </button>
        ) : null}
        {isSuggestionOpen ? (
          <div className={styles.comboMenu}>
            {suggestionOptions.map((person) => (
              <button
                key={`${field.key}-${person.id}`}
                type="button"
                className={styles.comboOption}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSavedPersonSuggestion(field.key, person)}
              >
                {getSuggestionLabel(field.key, person)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <div className={styles.page}>
        <div className={styles.workspace}>
          <section className={styles.mainPanel}>
            <div className={styles.modeSwitch} role="group" aria-label="Endorsement generator mode">
              <span className={styles.mobileStepLabel}>1 Mode</span>
              <button
                type="button"
                className={generatorMode === 'customized' ? styles.modeSwitchActive : ''}
                onClick={() => handleGeneratorModeChange('customized')}
                aria-pressed={generatorMode === 'customized'}
              >
                Customized endorsement
              </button>
              <button
                type="button"
                className={generatorMode === 'blank' ? styles.modeSwitchActive : ''}
                onClick={() => handleGeneratorModeChange('blank')}
                aria-pressed={generatorMode === 'blank'}
              >
                Blank template
              </button>
            </div>

            <div className={styles.mobileWorkflowStatus} aria-label="Endorsement workflow status">
              <span>{generatorMode === 'blank' ? 'Blank' : 'Custom'}</span>
              <span>{selectedTemplates.length} selected</span>
              <span>
                {selectedTemplateFields.length > 0
                  ? `${completedTemplateFieldCount}/${selectedTemplateFields.length} details`
                  : 'No details'}
              </span>
              <span>{signaturePreviewDataUrl ? 'Signed' : 'No signature'}</span>
            </div>

            <div className={styles.card}>
              <p className={styles.mobileStepLabel}>2 Profiles</p>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>{generatorMode === 'blank' ? 'Optional instructor details' : 'Information details(* required)'}</h2>
                  {generatorMode === 'blank' ? (
                    <p className={styles.sectionCopy}>
                      Enter any instructor details you want to preprint. All other fields stay blank for handwriting.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className={styles.formRows}>
                <div className={styles.formRowThree}>
                  {FIELD_CONFIG.slice(0, 3).map((field) => (
                    <label key={field.key} className={styles.field}>
                      <span>
                        {field.label}
                        {generatorMode === 'blank' ? ' (optional)' : field.required ? ' *' : field.hideOptionalTag ? '' : ' (optional)'}
                      </span>
                      {renderFieldInput(field)}
                      {errors[field.key] ? <small>{errors[field.key]}</small> : null}
                    </label>
                  ))}
                </div>

                {generatorMode === 'customized' ? (
                  <>
                    <div className={styles.formRowTwo}>
                      {FIELD_CONFIG.slice(3, 5).map((field) => (
                        <label key={field.key} className={styles.field}>
                          <span>
                            {field.label}
                            {field.required ? ' *' : field.hideOptionalTag ? '' : ' (optional)'}
                          </span>
                          {renderFieldInput(field)}
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
                  </>
                ) : (
                  <div className={styles.inlineActionBlock}>
                    <button className={styles.primaryButton} onClick={openModal} type="button">
                      Select blank template
                    </button>
                  </div>
                )}
              </div>
            </div>

            {generatorMode === 'customized' && selectedTemplateFields.length > 0 ? (
              <div className={styles.card}>
                <p className={styles.mobileStepLabel}>3 Details</p>
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
              <p className={styles.mobileStepLabel}>4 Signature</p>
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

              <button
                className={`${styles.mobileSignatureTrigger} ${
                  isMobileSignatureDevice ? styles.mobileSignatureTriggerActive : ''
                }`}
                type="button"
                onClick={openSignatureModal}
              >
                {signaturePreviewDataUrl ? (
                  <>
                    <span
                      className={styles.mobileSignaturePreview}
                      style={{ backgroundImage: `url(${signaturePreviewDataUrl})` }}
                      aria-hidden="true"
                    />
                    <span>Edit signature</span>
                  </>
                ) : (
                  <>
                    <span className={styles.mobileSignaturePlaceholder}>Tap to sign</span>
                    <span>Open full-screen signature pad</span>
                  </>
                )}
              </button>

              <canvas
                ref={canvasRef}
                className={`${styles.signatureCanvas} ${
                  isMobileSignatureDevice ? styles.signatureCanvasHiddenOnMobile : ''
                }`}
              />

              <div className={styles.actionRow}>
                <span className={styles.mobileStepLabel}>5 Preview &amp; print</span>
                <button className={styles.secondaryButton} onClick={handlePreview} type="button">
                  Preview
                </button>
                <button className={styles.secondaryButton} onClick={handlePrint} type="button" disabled={!pdfUrl || savingRecord}>
                  {savingRecord ? 'Saving...' : 'Print'}
                </button>
                {printablePdfUrl ? (
                  <button className={styles.secondaryButton} onClick={handleOpenPrintablePdf} type="button">
                    Open printable PDF
                  </button>
                ) : null}
              </div>

              <p className={styles.printHint}>
                You can choose a print format after clicking Print: standard Letter paper or Avery 5163 labels.
                {generatorMode === 'customized' && session?.user?.id
                  ? ' Printing automatically saves the PDF to your dashboard records.'
                  : ''}
              </p>
              {statusMessage ? <p className={styles.statusMessage}>{statusMessage}</p> : null}
              {errors.selectedTemplates ? <p className={styles.inlineError}>{errors.selectedTemplates}</p> : null}
            </div>
          </section>
        </div>
      </div>

      <Modal
        isOpen={printModalOpen}
        onRequestClose={() => setPrintModalOpen(false)}
        contentLabel="Choose print format"
        className="Modal"
        overlayClassName="Overlay"
      >
        <div className="endorsementModal">
          <div className="endorsementModalHeader">
            <div>
              <h2>Choose print format</h2>
              <p>Select standard Letter paper or Avery 5163 labels before opening the print dialog.</p>
            </div>
            <div className="endorsementModalActions">
              <button
                type="button"
                className="modalGhostButton"
                onClick={() => setPrintModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modalPrimaryButton"
                onClick={handlePrintFormatConfirm}
              >
                Continue to print
              </button>
            </div>
          </div>
          <div className={styles.printFormatBody}>
            <label className={styles.printFormatOption}>
              <input
                type="radio"
                name="print-format"
                value="letter"
                checked={printFormat === 'letter'}
                onChange={(event) => setPrintFormat(event.target.value)}
              />
              <span>
                <strong>Standard Letter paper</strong>
                <small>Use the existing endorsement PDF layout.</small>
              </span>
            </label>
            <label className={styles.printFormatOption}>
              <input
                type="radio"
                name="print-format"
                value="avery-5163"
                checked={printFormat === 'avery-5163'}
                onChange={(event) => setPrintFormat(event.target.value)}
              />
              <span>
                <strong>Avery 5163 labels</strong>
                <small>Print one endorsement per 2&quot; x 4&quot; label on a 10-label sheet.</small>
              </span>
            </label>
            {printFormat === 'avery-5163' ? (
              <label className={styles.printStartSlot}>
                <span>Start at label slot</span>
                <select value={labelStartSlot} onChange={(event) => setLabelStartSlot(event.target.value)}>
                  {Array.from({ length: AVERY_5163_LABELS_PER_PAGE }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </select>
                <small>Slots fill from left to right, then top to bottom. Earlier slots stay blank.</small>
              </label>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={guestRegisterPromptOpen}
        onRequestClose={() => setGuestRegisterPromptOpen(false)}
        contentLabel="Create an account"
        className="Modal"
        overlayClassName="Overlay"
      >
        <div className="endorsementModal">
          <div className="endorsementModalHeader">
            <div>
              <h2>Create an account</h2>
              <p>
                Your PDF is open in a new page. Register to save CFI certificates, student profiles,
                and endorsement records for next time.
              </p>
            </div>
            <div className="endorsementModalActions">
              <button
                type="button"
                className="modalGhostButton"
                onClick={() => setGuestRegisterPromptOpen(false)}
              >
                Continue as guest
              </button>
              <button
                type="button"
                className="modalPrimaryButton"
                onClick={() => {
                  setGuestRegisterPromptOpen(false);
                  router.push('/register?next=%2Fdashboard%3Fonboarding%3Dendorsement-cfi');
                }}
              >
                Register
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {signatureModalOpen ? (
        <div ref={signatureModalOverlayRef} className={styles.signatureModalOverlay}>
          <div className={`${styles.signatureModal} ${isRotatedSignatureMode ? styles.signatureModalRotated : ''}`}>
            <div className={styles.signatureModalHeader}>
              <div>
                <h2>Sign endorsement</h2>
                <p>Rotate your phone for more signing space.</p>
              </div>
              <div className={styles.signatureModalActions}>
                <button type="button" onClick={clearMobileSignature}>
                  Clear
                </button>
                <button type="button" onClick={closeSignatureModal}>
                  Cancel
                </button>
                <button type="button" onClick={confirmMobileSignature}>
                  Done
                </button>
              </div>
            </div>
            <div className={styles.signatureModalCanvasWrap}>
              <canvas ref={mobileSignatureCanvasRef} className={styles.signatureModalCanvas} />
            </div>
          </div>
        </div>
      ) : null}

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
              <h2>{generatorMode === 'blank' ? 'Select blank endorsement templates' : 'Select endorsement templates'}</h2>
              <p>
                {generatorMode === 'blank'
                  ? 'Customizable fields will print as handwriting blanks.'
                  : 'Selected templates stay pinned to the top of the result list.'}
              </p>
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
