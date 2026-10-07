/**
 * Academic Data Module
 * Dynamic Matrix-based academic data helpers for Faculty -> Institutes -> Departments.
 * Driven strictly by System Settings Matrix Setup (facultyMatrix).
 */

import type { FacultyMatrixItem, User } from "@/types"

export interface DepartmentOption {
  label: string;
  value: string;
}

export interface InstituteOption {
  label: string;
  value: string;
  departments: string[];
}

export interface FacultyConfig {
  name: string;
  aliases: string[];
  institutes: InstituteOption[];
}

/**
 * Get sorted list of faculty names from matrix
 */
export function getFacultiesFromMatrix(matrix?: FacultyMatrixItem[]): string[] {
  const activeMatrix = (matrix && matrix.length > 0) ? matrix : defaultGoaMatrix;
  const normalized = normalizeFacultyMatrix(activeMatrix);
  return normalized.map(f => f.name).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * Get sorted list of institutes under a given faculty from matrix
 */
export function getInstitutesForFacultyFromMatrix(faculty: string, matrix?: FacultyMatrixItem[]): InstituteOption[] {
  if (!faculty) return [];
  const activeMatrix = (matrix && matrix.length > 0) ? matrix : defaultGoaMatrix;
  const normalized = normalizeFacultyMatrix(activeMatrix);
  const matched = normalized.find(f =>
    f.name.toLowerCase().trim() === faculty.toLowerCase().trim() ||
    ((f as any).aliases && (f as any).aliases.some((a: string) => a.toLowerCase().trim() === faculty.toLowerCase().trim()))
  );
  if (!matched) return [];
  return (matched.institutes || [])
    .map(i => ({
      label: i.name,
      value: i.name,
      departments: (i.departments || []).map(d => d.name).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

/**
 * Get sorted list of departments under a given institute from matrix
 */
export function getDepartmentsForInstituteFromMatrix(institute: string, matrix?: FacultyMatrixItem[]): string[] {
  if (!institute) return [];
  const activeMatrix = (matrix && matrix.length > 0) ? matrix : defaultGoaMatrix;
  const normalized = normalizeFacultyMatrix(activeMatrix);
  for (const f of normalized) {
    const matchedInst = (f.institutes || []).find(i =>
      i.name.toLowerCase().trim() === institute.toLowerCase().trim()
    );
    if (matchedInst) {
      return (matchedInst.departments || [])
        .map(d => d.name)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }
  }
  return [];
}

/**
 * Retrieve configured Stage 1 Principal / Authority email for an institute
 */
export function getPrincipalEmailForInstitute(institute: string, matrix?: FacultyMatrixItem[]): string | null {
  if (!institute) return null;
  const activeMatrix = (matrix && matrix.length > 0) ? matrix : defaultGoaMatrix;
  const normalized = normalizeFacultyMatrix(activeMatrix);
  for (const f of normalized) {
    const matchedInst = (f.institutes || []).find(i =>
      i.name.toLowerCase().trim() === institute.toLowerCase().trim()
    );
    if (matchedInst && matchedInst.authorityEmail && matchedInst.authorityEmail.trim()) {
      return matchedInst.authorityEmail.trim();
    }
  }
  return null;
}

/**
 * Check if a faculty qualifies for special incentive policy (Medical, Allied Health, Engineering, Sciences)
 */
export function isSpecialPolicyFaculty(facultyName?: string | null): boolean {
  if (!facultyName) return false;
  const normalized = facultyName.trim().toLowerCase();
  
  const specialKeywords = [
    "applied sciences",
    "applied and health sciences",
    "medicine",
    "homoeopathy",
    "ayurved",
    "nursing",
    "pharmacy",
    "physiotherapy",
    "public health",
    "engineering & technology",
    "engineering, it & cs",
    "it & computer science",
    "engineering"
  ];
  
  return specialKeywords.some(keyword => normalized.includes(keyword));
}

/**
 * Backward compatibility helpers
 */
export function getInstitutesForFaculty(faculty: string, matrix?: FacultyMatrixItem[]): InstituteOption[] | null {
  const list = getInstitutesForFacultyFromMatrix(faculty, matrix);
  return list.length > 0 ? list : null;
}

export function getDepartmentsForInstitute(institute: string, matrix?: FacultyMatrixItem[]): string[] | null {
  const list = getDepartmentsForInstituteFromMatrix(institute, matrix);
  return list.length > 0 ? list : null;
}

export const defaultGoaMatrix: FacultyMatrixItem[] = [
  {
    id: "fac-goa-eng-it",
    name: "Faculty of Engineering, IT & CS",
    authorityEmail: "",
    institutes: [
      {
        id: "inst-goa-pce",
        name: "Parul College of Engineering",
        authorityEmail: "",
        departments: [
          { id: "dept-goa-cse", name: "Computer Science & Engineering", authorityEmail: "" },
          { id: "dept-goa-civil", name: "Civil Engineering", authorityEmail: "" },
          { id: "dept-goa-mech", name: "Mechanical Engineering", authorityEmail: "" },
          { id: "dept-goa-elec", name: "Electrical Engineering", authorityEmail: "" },
          { id: "dept-goa-ece", name: "Electronics & Communication Engineering", authorityEmail: "" }
        ]
      },
      {
        id: "inst-goa-itcs",
        name: "Parul College of Information Technology & Computer Science",
        authorityEmail: "",
        departments: [
          { id: "dept-goa-it", name: "Information Technology", authorityEmail: "" },
          { id: "dept-goa-mca", name: "Computer Applications", authorityEmail: "" }
        ]
      }
    ]
  },
  {
    id: "fac-goa-mgmt",
    name: "Faculty of Management Studies",
    authorityEmail: "",
    institutes: [
      {
        id: "inst-goa-mgmt",
        name: "Parul College of Management",
        authorityEmail: "",
        departments: [
          { id: "dept-goa-mgmt-studies", name: "Management Studies", authorityEmail: "" },
          { id: "dept-goa-bba", name: "Business Administration", authorityEmail: "" }
        ]
      }
    ]
  },
  {
    id: "fac-goa-hotel",
    name: "Faculty of Hotel Management",
    authorityEmail: "",
    institutes: [
      {
        id: "inst-goa-hotel",
        name: "Parul College of Hotel Management",
        authorityEmail: "",
        departments: [
          { id: "dept-goa-hotel-mgmt", name: "Hotel Management & Catering Technology", authorityEmail: "" }
        ]
      }
    ]
  },
  {
    id: "fac-goa-pharmacy",
    name: "Faculty of Pharmacy",
    authorityEmail: "",
    institutes: [
      {
        id: "inst-goa-pharmacy",
        name: "Parul College of Pharmacy",
        authorityEmail: "",
        departments: [
          { id: "dept-goa-pharmacy", name: "Pharmacy", authorityEmail: "" },
          { id: "dept-goa-pharmaceutics", name: "Pharmaceutics", authorityEmail: "" },
          { id: "dept-goa-pharmacology", name: "Pharmacology", authorityEmail: "" },
          { id: "dept-goa-pharm-chem", name: "Pharmaceutical Chemistry", authorityEmail: "" }
        ]
      }
    ]
  },
  {
    id: "fac-goa-health",
    name: "Faculty of Applied and Health Sciences",
    authorityEmail: "",
    institutes: [
      {
        id: "inst-goa-health",
        name: "Parul College of Applied and Health Sciences",
        authorityEmail: "",
        departments: [
          { id: "dept-goa-app-sci", name: "Applied Sciences", authorityEmail: "" },
          { id: "dept-goa-clt", name: "Department of Microbiology", authorityEmail: "" },
          { id: "dept-goa-clt-2", name: "Clinical Lab Technology", authorityEmail: "" }
        ]
      }
    ]
  },
  {
    id: "fac-goa-nursing",
    name: "Faculty of Nursing",
    authorityEmail: "",
    institutes: [
      {
        id: "inst-goa-nursing",
        name: "Parul College of Nursing",
        authorityEmail: "",
        departments: [
          { id: "dept-goa-nursing", name: "Nursing", authorityEmail: "" }
        ]
      }
    ]
  },
  {
    id: "fac-goa-physio",
    name: "Faculty of Physiotherapy",
    authorityEmail: "",
    institutes: [
      {
        id: "inst-goa-physio",
        name: "Parul College of Physiotherapy",
        authorityEmail: "",
        departments: [
          { id: "dept-goa-physio", name: "Physiotherapy", authorityEmail: "" }
        ]
      }
    ]
  },
  {
    id: "fac-goa-office",
    name: "University Office",
    authorityEmail: "",
    institutes: [
      {
        id: "inst-goa-univ-office",
        name: "University Office",
        authorityEmail: "",
        departments: [
          { id: "dept-goa-admin", name: "Administration", authorityEmail: "" },
          { id: "dept-goa-rdc", name: "Research & Development Cell", authorityEmail: "" }
        ]
      }
    ]
  }
];

/**
 * Normalize and sort matrix hierarchy A-Z
 */
export function normalizeFacultyMatrix(matrix?: FacultyMatrixItem[]): FacultyMatrixItem[] {
  const activeSource = (matrix && Array.isArray(matrix) && matrix.length > 0)
    ? matrix
    : defaultGoaMatrix;

  const alliedKeywords = [
    "faculty of allied & healthcare sciences",
    "faculty of allied and healthcare sciences",
    "faculty of allied health sciences",
    "allied & healthcare sciences",
    "allied health sciences"
  ];
  const publicHealthKeywords = [
    "faculty of public health",
    "public health"
  ];

  const facultiesToMerge = activeSource.filter(f => {
    const name = (f.name || "").toLowerCase().trim();
    return alliedKeywords.includes(name) || publicHealthKeywords.includes(name);
  });
  
  // Clone matrix to avoid mutating arguments unexpectedly
  const normalizedMatrix: FacultyMatrixItem[] = JSON.parse(JSON.stringify(activeSource));

  // Find existing Faculty of Medicine if any
  let medFac = normalizedMatrix.find(f => {
    const name = (f.name || "").toLowerCase().trim();
    return name === "faculty of medicine" || name === "medicine";
  });

  // Only perform medicine merge if there are legacy top-level faculties to merge
  if (facultiesToMerge.length > 0) {
    if (!medFac) {
      medFac = {
        id: `fac-med-${Date.now()}`,
        name: "Faculty of Medicine",
        authorityEmail: "",
        institutes: []
      };
      normalizedMatrix.push(medFac);
    }

    // Move institutes from merged faculties into Faculty of Medicine
    facultiesToMerge.forEach(mergedFac => {
      (mergedFac.institutes || []).forEach(inst => {
        const existingInst = medFac!.institutes.find(i => (i.name || "").toLowerCase().trim() === (inst.name || "").toLowerCase().trim());
        if (!existingInst) {
          medFac!.institutes.push(inst);
        } else {
          // Merge departments if missing
          (inst.departments || []).forEach(dept => {
            if (!existingInst.departments.some(d => (d.name || "").toLowerCase().trim() === (dept.name || "").toLowerCase().trim())) {
              existingInst.departments.push(dept);
            }
          });
        }
      });
    });
  }

  // Filter out merged faculties and sort in ascending order (A-Z)
  return normalizedMatrix
    .filter(f => {
      const name = (f.name || "").toLowerCase().trim();
      return !alliedKeywords.includes(name) && !publicHealthKeywords.includes(name);
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: 'base' }))
    .map(fac => ({
      ...fac,
      institutes: (fac.institutes || [])
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: 'base' }))
        .map(inst => ({
          ...inst,
          departments: (inst.departments || []).sort((a, b) =>
            (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: 'base' })
          )
        }))
    }));
}

export function resolveAuthorityAccess(email: string, matrix?: FacultyMatrixItem[]) {
  const faculties: string[] = [];
  const institutes: string[] = [];
  const departments: string[] = [];
  const targetEmail = (email || '').trim().toLowerCase();

  const activeMatrix = (matrix && matrix.length > 0) ? matrix : defaultGoaMatrix;
  const normalized = normalizeFacultyMatrix(activeMatrix);

  normalized.forEach(fac => {
    // If user is Faculty Authority
    if (fac.authorityEmail && fac.authorityEmail.trim().toLowerCase() === targetEmail) {
      faculties.push(fac.name);
      // Cascading access to all institutes & departments under it
      fac.institutes.forEach(inst => {
        institutes.push(inst.name);
        inst.departments.forEach(dept => {
          departments.push(dept.name);
        });
      });
    } else {
      // Check institutes
      fac.institutes.forEach(inst => {
        // If user is Institute Authority
        if (inst.authorityEmail && inst.authorityEmail.trim().toLowerCase() === targetEmail) {
          institutes.push(inst.name);
          // Cascading access to all departments under it
          inst.departments.forEach(dept => {
            departments.push(dept.name);
          });
        } else {
          // Check departments
          inst.departments.forEach(dept => {
            if (dept.authorityEmail && dept.authorityEmail.trim().toLowerCase() === targetEmail) {
              departments.push(dept.name);
            }
          });
        }
      });
    }
  });

  const hasAccess = faculties.length > 0 || institutes.length > 0 || departments.length > 0;
  return { hasAccess, faculties, institutes, departments };
}

export const getUserAuthorityScope = resolveAuthorityAccess;

export function checkProfileStatus(u: User, matrix: any[] | undefined) {
  const { faculty, institute, department } = u;
  
  const isGuest = u.designation === "CRO Evaluator" || u.designation === "Guest Faculty" || u.designation === "Guest Evaluator" || u.role === "Evaluator";
  if (isGuest) {
    return { isValid: true, reason: "" };
  }

  if (!faculty || !institute || !department) {
    return { isValid: false, reason: "Missing academic details" };
  }

  if (!matrix || matrix.length === 0) {
    return { isValid: true, reason: "" };
  }

  const activeMatrix = normalizeFacultyMatrix(matrix);

  const matchedFaculty = activeMatrix.find(
    (f: any) =>
      f.name.toLowerCase() === faculty.trim().toLowerCase() ||
      (f.aliases && f.aliases.some((alias: string) => alias.toLowerCase() === faculty.trim().toLowerCase()))
  );

  if (!matchedFaculty) {
    return { isValid: false, reason: `Invalid Faculty: "${faculty}"` };
  }

  const matchedInstitute = matchedFaculty.institutes.find(
    (i: any) =>
      (i.value && i.value.toLowerCase() === institute.trim().toLowerCase()) ||
      (i.label && i.label.toLowerCase() === institute.trim().toLowerCase()) ||
      (i.name && i.name.toLowerCase() === institute.trim().toLowerCase())
  );

  if (!matchedInstitute) {
    return { isValid: false, reason: `Invalid Institute: "${institute}"` };
  }

  const matchedDept = matchedInstitute.departments.find((d: any) => {
    const deptName = typeof d === 'string' ? d : d.name;
    const normalizedDeptName = deptName.toLowerCase().trim();
    const normalizedUserDept = department.toLowerCase().trim();
    
    return (
      normalizedDeptName === normalizedUserDept ||
      (normalizedDeptName === "research & development cell" && normalizedUserDept === "rdc") ||
      (normalizedDeptName === "rdc" && normalizedUserDept === "research & development cell")
    );
  });

  if (!matchedDept) {
    return { isValid: false, reason: `Invalid Department: "${department}"` };
  }

  return { isValid: true, reason: "" };
}
