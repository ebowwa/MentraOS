import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Mail, UserPlus, AlertCircle, CheckCircle2, Loader2, Shield, User, UserCog } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import api, { OrgMember, OrgRole } from '@/services/api.service';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';

/**
 * Members page for managing organization members
 * Allows inviting new members and changing roles of existing members
 */
const Members: React.FC = () => {
  const { currentOrg, refreshOrgs } = useOrganization();

  // Member list state
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('member');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // Load members when organization changes
  useEffect(() => {
    fetchMembers();
  }, [currentOrg]);

  // Fetch members list
  const fetchMembers = async () => {
    if (!currentOrg) {
      setLoadingMembers(false);
      return;
    }

    try {
      setLoadingMembers(true);
      setError(null);

      const orgMembers = await api.orgs.members(currentOrg.id);
      setMembers(orgMembers);
    } catch (err) {
      console.error('Error fetching members:', err);
      setError('Failed to load organization members');
      toast.error('Failed to load members');
    } finally {
      setLoadingMembers(false);
    }
  };

  // Handle member role change
  const handleRoleChange = async (memberId: string, newRole: OrgRole) => {
    if (!currentOrg) return;

    try {
      await api.orgs.changeRole(currentOrg.id, memberId, newRole);
      await fetchMembers();
      toast.success('Member role updated');
    } catch (err) {
      console.error('Error changing role:', err);
      toast.error('Failed to update member role');
    }
  };

  // Handle member removal
  const handleRemoveMember = async (memberId: string) => {
    if (!currentOrg) return;

    if (!confirm('Are you sure you want to remove this member from the organization?')) {
      return;
    }

    try {
      await api.orgs.removeMember(currentOrg.id, memberId);
      await fetchMembers();
      toast.success('Member removed from organization');
    } catch (err) {
      console.error('Error removing member:', err);
      toast.error('Failed to remove member');
    }
  };

  // Handle invite submission
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentOrg) {
      setError('No organization selected');
      return;
    }

    // Validate email
    if (!inviteEmail || !inviteEmail.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setIsInviting(true);
    setError(null);
    setInviteSuccess(false);

    try {
      await api.orgs.invite(currentOrg.id, inviteEmail, inviteRole);

      // Show success message and reset form
      setInviteSuccess(true);
      setInviteEmail('');
      setInviteRole('member');

      toast.success(`Invitation sent to ${inviteEmail}`);

      // Reset success after 3 seconds
      setTimeout(() => {
        setInviteSuccess(false);
      }, 3000);
    } catch (err) {
      console.error('Error sending invite:', err);
      setError('Failed to send invitation. Please try again.');
      toast.error('Failed to send invitation');
    } finally {
      setIsInviting(false);
    }
  };

  // Render role icon based on role
  const RoleIcon = ({ role }: { role: OrgRole }) => {
    switch (role) {
      case 'owner':
        return <Shield className="h-4 w-4 text-indigo-600" />;
      case 'admin':
        return <UserCog className="h-4 w-4 text-blue-600" />;
      default:
        return <User className="h-4 w-4 text-gray-600" />;
    }
  };

  // If no organization is selected
  if (!currentOrg) {
    return (
      <DashboardLayout>
        <div className="max-w-5xl mx-auto">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl">Organization Members</CardTitle>
              <CardDescription>No organization selected</CardDescription>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You don't have an active organization. Please create or join an organization first.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Member list */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Organization Members</CardTitle>
            <CardDescription>
              Manage members of {currentOrg.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingMembers ? (
              <div className="p-8 text-center">
                <div className="animate-spin mx-auto h-8 w-8 border-t-2 border-b-2 border-blue-500 rounded-full"></div>
                <p className="mt-2 text-gray-500">Loading members...</p>
              </div>
            ) : (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-4 text-gray-500">
                          No members found
                        </TableCell>
                      </TableRow>
                    ) : (
                      members.map((member) => (
                        <TableRow key={member.user.id}>
                          <TableCell>{member.user.email}</TableCell>
                          <TableCell>{member.user.displayName || '—'}</TableCell>
                          <TableCell className="flex items-center gap-1">
                            <RoleIcon role={member.role} />
                            <Select
                              value={member.role}
                              onValueChange={(value: OrgRole) => handleRoleChange(member.user.id, value)}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue placeholder={member.role} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="owner">Owner</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="member">Member</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>{new Date(member.joinedAt).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveMember(member.user.id)}
                              disabled={member.role === 'owner'}
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Invite form */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Invite New Member</CardTitle>
            <CardDescription>
              Send an invitation to join your organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {inviteSuccess && (
                <Alert className="bg-green-50 text-green-800 border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-700">
                    Invitation sent successfully!
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="inviteEmail" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Address
                </Label>
                <Input
                  id="inviteEmail"
                  type="email"
                  placeholder="colleague@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inviteRole" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Role
                </Label>
                <Select value={inviteRole} onValueChange={(value: OrgRole) => setInviteRole(value)}>
                  <SelectTrigger id="inviteRole" className="w-full">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner (full control, can delete org)</SelectItem>
                    <SelectItem value="admin">Admin (can manage members and apps)</SelectItem>
                    <SelectItem value="member">Member (can use apps)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {inviteRole === 'owner' && 'Owners have full control over the organization, including deleting it.'}
                  {inviteRole === 'admin' && 'Admins can manage members and apps, but cannot delete the organization.'}
                  {inviteRole === 'member' && 'Members can use organization apps, but cannot manage them.'}
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={isInviting}>
                  {isInviting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Send Invitation
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Members;