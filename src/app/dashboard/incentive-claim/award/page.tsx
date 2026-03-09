import { AwardForm } from '@/components/incentives/award-form';
import { PageHeader } from '@/components/page-header';

export default function AwardClaimPage() {
  return (
    <>
<PageHeader
        title="Honoring the Award Winners"
        description="Fill out the form below to apply for incentive."
        backButtonHref="/dashboard/incentive-claim"
        backButtonText="Back to Claim Types"
      />
      <br />
      <AwardForm />
    </>
  );
}
