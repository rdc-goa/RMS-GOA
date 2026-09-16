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
  if (!matrix || matrix.length === 0) return [];
  const normalized = normalizeFacultyMatrix(matrix);
  return normalized.map(f => f.name).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * Get sorted list of institutes under a given faculty from matrix
 */
export function getInstitutesForFacultyFromMatrix(faculty: string, matrix?: FacultyMatrixItem[]): InstituteOption[] {
  if (!faculty || !matrix || matrix.length === 0) return [];
  const normalized = normalizeFacultyMatrix(matrix);
  const matched = normalized.find(f => f.name.toLowerCase().trim() === faculty.toLowerCase().trim());
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
  if (!institute || !matrix || matrix.length === 0) return [];
  const normalized = normalizeFacultyMatrix(matrix);
  for (const f of normalized) {
    const matchedInst = (f.institutes || []).find(i => i.name.toLowerCase().trim() === institute.toLowerCase().trim());
    if (matchedInst) {
      return (matchedInst.departments || [])
        .map(d => d.name)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }
  }
  return [];
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

/**
 * Normalize and sort matrix hierarchy A-Z
 */
export function normalizeFacultyMatrix(matrix: FacultyMatrixItem[]): FacultyMatrixItem[] {
  if (!matrix || !Array.isArray(matrix) || matrix.length === 0) return [];

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

  const facultiesToMerge = matrix.filter(f => {
    const name = (f.name || "").toLowerCase().trim();
    return alliedKeywords.includes(name) || publicHealthKeywords.includes(name);
  });
  
  // Clone matrix to avoid mutating arguments unexpectedly
  const normalizedMatrix: FacultyMatrixItem[] = JSON.parse(JSON.stringify(matrix));

  // Find or create Faculty of Medicine
  let medFac = normalizedMatrix.find(f => {
    const name = (f.name || "").toLowerCase().trim();
    return name === "faculty of medicine" || name === "medicine";
  });

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

  // Ensure standard Parul Institute of Allied & Healthcare Sciences exists under Faculty of Medicine
  let alliedInst = medFac.institutes.find(i => 
    (i.name || "").toLowerCase().includes("allied & healthcare sciences") || 
    (i.name || "").toLowerCase().includes("allied and healthcare sciences")
  );

  if (!alliedInst) {
    alliedInst = {
      id: `inst-med-allied-${Date.now()}`,
      name: "Parul Institute of Allied & Healthcare Sciences",
      authorityEmail: "",
      departments: []
    };
    medFac.institutes.push(alliedInst);
  }

  const defaultAlliedDepts = ["Clinical Lab Technology", "Radiology", "Operation Theatre Technology", "Allied Health Sciences", "Healthcare Sciences"];
  defaultAlliedDepts.forEach((dName, dIdx) => {
    if (!alliedInst!.departments.some(d => (d.name || "").toLowerCase().trim() === dName.toLowerCase().trim())) {
      alliedInst!.departments.push({
        id: `dept-med-allied-${dIdx}-${Date.now()}`,
        name: dName,
        authorityEmail: ""
      });
    }
  });

  // Ensure standard Parul Institute of Public Health exists under Faculty of Medicine
  let pubHealthInst = medFac.institutes.find(i => 
    (i.name || "").toLowerCase().includes("public health")
  );

  if (!pubHealthInst) {
    pubHealthInst = {
      id: `inst-med-pubhealth-${Date.now()}`,
      name: "Parul Institute of Public Health",
      authorityEmail: "",
      departments: []
    };
    medFac.institutes.push(pubHealthInst);
  }

  const defaultPublicHealthDepts = ["Public Health"];
  defaultPublicHealthDepts.forEach((dName, dIdx) => {
    if (!pubHealthInst!.departments.some(d => (d.name || "").toLowerCase().trim() === dName.toLowerCase().trim())) {
      pubHealthInst!.departments.push({
        id: `dept-med-pubhealth-${dIdx}-${Date.now()}`,
        name: dName,
        authorityEmail: ""
      });
    }
  });

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

export function resolveAuthorityAccess(email: string, matrix: FacultyMatrixItem[]) {
  const faculties: string[] = [];
  const institutes: string[] = [];
  const departments: string[] = [];
  const targetEmail = email.trim().toLowerCase();

  if (!matrix || matrix.length === 0) {
    return { hasAccess: false, faculties, institutes, departments };
  }

  const normalized = normalizeFacultyMatrix(matrix);

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
