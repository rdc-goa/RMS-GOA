
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { EmrInterest, User } from '@/types';
import { updateEmrInterestDetails } from '@/app/emr-actions';

interface HistoricalBulkUploadsProps {
  interests: EmrInterest[];
  allUsers: User[];
  onUpdate: () => void;
}

export default function HistoricalBulkUploads({ interests, allUsers, onUpdate }: HistoricalBulkUploadsProps) {
  const [editableInterests, setEditableInterests] = useState<EmrInterest[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    setEditableInterests(interests);
  }, [interests]);

  const userMap = new Map(allUsers.map(u => [u.uid, u]));

  const handleInputChange = (index: number, field: string, value: string) => {
    const updated = [...editableInterests];
    updated[index] = { ...updated[index], [field]: value };
    setEditableInterests(updated);
  };

  const handleCoPiEmailChange = (index: number, coPiIndex: number, value: string) => {
    const updated = [...editableInterests];
    const coPiDetails = updated[index].coPiDetails ? [...updated[index].coPiDetails] : [];
    if (coPiDetails.length <= coPiIndex) {
      coPiDetails.push({ name: '', email: value, uid: '' });
    } else {
      coPiDetails[coPiIndex] = { ...coPiDetails[coPiIndex], email: value };
    }
    updated[index] = { ...updated[index], coPiDetails };
    setEditableInterests(updated);
  };

  const handleSave = async (interest: EmrInterest, index: number) => {
    try {
      // Validate emails and link to user profiles if possible
      const coPiDetails = interest.coPiDetails || [];
      // Here you might want to add logic to validate and link emails to user profiles

      const updateData = {
        callTitle: interest.callTitle || '',
        coPiDetails,
        userEmail: interest.userEmail,
      };

      const result = await updateEmrInterestDetails(interest.id, updateData);
      if (result.success) {
        toast({ title: 'Updated', description: 'Interest details updated successfully.' });
        onUpdate();
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to update details.' });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update details.' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historical Bulk Uploads</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project Name</TableHead>
              <TableHead>PI Name</TableHead>
              <TableHead>PI Email</TableHead>
              <TableHead>Co-PI Emails</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {editableInterests.map((interest, index) => (
              <TableRow key={interest.id}>
                <TableCell>{interest.callTitle}</TableCell>
                <TableCell>{interest.userName}</TableCell>
                <TableCell>
                  <Input
                    type="email"
                    value={interest.userEmail || ''}
                    onChange={(e) => handleInputChange(index, 'userEmail', e.target.value)}
                    placeholder="Enter PI Email"
                  />
                </TableCell>
                <TableCell>
                  {interest.coPiDetails && interest.coPiDetails.length > 0 ? (
                    interest.coPiDetails.map((coPi, coPiIndex) => (
                      <Input
                        key={coPiIndex}
                        type="email"
                        value={coPi.email || ''}
                        onChange={(e) => handleCoPiEmailChange(index, coPiIndex, e.target.value)}
                        placeholder="Enter Co-PI Email"
                        className="mb-1"
                      />
                    ))
                  ) : (
                    <p>No Co-PIs</p>
                  )}
                </TableCell>
                <TableCell>
                  <Button onClick={() => handleSave(interest, index)}>Save</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
