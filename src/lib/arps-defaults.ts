export const DEFAULT_POLICY_RULES = {
  weightage: {
    publication: 0.80,
    patent: 0.05,
    consultancy: 0.05,
    researchActivities: 0.05,
    emr: 0.05
  },
  caps: {
    publication: 80,
    patent: 5,
    consultancy: 5,
    researchActivities: 5,
    emr: 5
  },
  publications: {
    q1: 30,
    q2: 20,
    q3: 15,
    q4: 10,
    originalResearchMultiplier: 1.0,
    reviewQ1Q2Multiplier: 1.0,
    reviewQ3Q4Multiplier: 0.8,
    caseReportMultiplier: 0.9,
    singleAuthorMultiplier: 1.0,
    firstCorrespondingMultiplier: 0.7,
    coAuthorUpTo5Multiplier: 0.3,
    coAuthor6OnwardsMultiplier: 0.1,
    singlePuCoAuthorWithExternalMultiplier: 0.8,
    bookChapterBase: 6,
    bookEditorBase: 18,
    conferenceProceedingsBase: 3
  },
  patents: {
    publishedBase: 10,
    grantedIndiaBase: 50,
    grantedInternationalBase: 75,
    puSoleApplicantMultiplier: 1.0,
    coApplicantMultiplier: 0.8
  },
  consultancy: {
    slabs: [
      { min: 10000, max: 50000, points: 10 },
      { min: 50000, max: 100000, points: 20 },
      { min: 100000, max: 300000, points: 30 },
      { min: 300000, max: 500000, points: 50 }
    ],
    baseAbove500k: 50,
    extraSlabStep: 50000,
    extraSlabPoints: 10
  },
  emr: {
    sanctioned: [
      { min: 2000000, max: 5000000, pi: 50, copi: 20 },
      { min: 5000000, max: 10000000, pi: 80, copi: 30 },
      { min: 10000000, max: 99999999999, pi: 100, copi: 40 }
    ],
    ongoing: [
      { min: 2000000, max: 5000000, pi: 25, copi: 10 },
      { min: 5000000, max: 10000000, pi: 40, copi: 15 },
      { min: 10000000, max: 99999999999, pi: 50, copi: 20 }
    ]
  },
  activities: {
    conferencePresentationIndia: 1,
    conferencePresentationOutsideIndia: 2,
    convener: 5,
    coordinator: 2,
    expertTalkInPu: 2,
    expertTalkOutsidePu: 5,
    participationInPu: 1,
    participationOutsidePu: 2,
    membership: 2,
    emrTeamMember: 2,
    phdCompleted: 20,
    phdOngoing: 10,
    pgCompleted: 10,
    pgOngoing: 5,
    subcategoryCap: 10
  },
  increments: {
    factor: 100,
    fixedDME: 5000,
    fixedME: 10000,
    fixedEE: 15000,
    fixedSEE: 25000
  }
};
