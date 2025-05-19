import { Types } from 'mongoose';
import { Organization, OrganizationDocument, OrgMember } from '../../models/organization.model';
import { User } from '../../models/user.model';

// Since UserDocument is not exported directly, define type based on User model
type UserDocument = {
  _id: Types.ObjectId;
  email: string;
  displayName?: string;
  profile?: {
    website?: string;
    description?: string;
    logo?: string;
  };
  organizations?: Types.ObjectId[];
  defaultOrg?: Types.ObjectId;
};

/**
 * Custom error class with status code for HTTP responses
 */
class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiError';

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Generates a URL-friendly slug from a string
 * @param name - The string to convert to a slug
 * @returns A URL-friendly slug
 */
async function generateSlug(name: string): Promise<string> {
  // Convert to lowercase and replace non-alphanumeric characters with hyphens
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, ''); // Remove leading and trailing hyphens

  // Ensure slug is not empty
  if (!slug) {
    slug = 'org';
  }

  return slug;
}

/**
 * Service for managing organizations
 */
export class OrganizationService {
  /**
   * Creates a personal organization for a user
   * @param user - The user document
   * @returns The ID of the created organization
   */
  public static async createPersonalOrg(user: UserDocument): Promise<Types.ObjectId> {
    const personalOrgName = `${user.displayName || user.email.split('@')[0]}'s Org`;
    const slug = await generateSlug(personalOrgName);

    // Create personal organization with user as owner
    const org = new Organization({
      name: personalOrgName,
      slug,
      profile: {
        contactEmail: user.email,
        // Copy any existing profile info from user if available
        ...(user.profile && {
          website: user.profile.website,
          description: user.profile.description,
          logo: user.profile.logo
        })
      },
      members: [{
        user: user._id,
        role: 'owner',
        joinedAt: new Date()
      }]
    });

    await org.save();
    return org._id;
  }

  /**
   * Creates a new organization
   * @param name - Organization name
   * @param creatorUser - The user creating the organization
   * @returns The created organization document
   */
  public static async createOrg(name: string, creatorUser: UserDocument): Promise<OrganizationDocument> {
    const slug = await generateSlug(name);

    const org = new Organization({
      name,
      slug,
      profile: {
        contactEmail: creatorUser.email
      },
      members: [{
        user: creatorUser._id,
        role: 'owner',
        joinedAt: new Date()
      }]
    });

    await org.save();

    // Add org to user's organizations list
    await User.updateOne(
      { _id: creatorUser._id },
      { $addToSet: { organizations: org._id } }
    );

    return org;
  }

  /**
   * Retrieves an organization by ID with populated members
   * @param id - Organization ID
   * @returns The organization document with populated members
   */
  public static async getOrgById(id: string | Types.ObjectId): Promise<OrganizationDocument | null> {
    return Organization.findById(id)
      .populate('members.user', 'email displayName profile.avatar')
      .exec();
  }

  /**
   * Lists all organizations a user is a member of
   * @param userId - User ID
   * @returns Array of organizations
   */
  public static async listUserOrgs(userId: string | Types.ObjectId): Promise<OrganizationDocument[]> {
    return Organization.find({
      'members.user': userId
    }).exec();
  }

  /**
   * Updates an organization's details
   * @param id - Organization ID
   * @param patch - Fields to update
   * @param actorUser - User performing the update
   * @returns The updated organization
   * @throws ApiError if user lacks permission
   */
  public static async updateOrg(
    id: string | Types.ObjectId,
    patch: Partial<Pick<OrganizationDocument, 'name' | 'profile'>>,
    actorUser: UserDocument
  ): Promise<OrganizationDocument> {
    // Verify user has admin rights
    const hasPermission = await this.isOrgAdmin(actorUser, id);
    if (!hasPermission) {
      throw new ApiError(403, 'Insufficient permissions to update organization');
    }

    // Prevent updating sensitive fields
    const sanitizedPatch: any = { ...patch };
    delete sanitizedPatch._id;
    delete sanitizedPatch.members;
    delete sanitizedPatch.slug;

    // If name is being updated, generate new slug
    if (sanitizedPatch.name) {
      sanitizedPatch.slug = await generateSlug(sanitizedPatch.name);
    }

    const org = await Organization.findByIdAndUpdate(
      id,
      { $set: sanitizedPatch },
      { new: true, runValidators: true }
    );

    if (!org) {
      throw new ApiError(404, 'Organization not found');
    }

    return org;
  }

  /**
   * Invites a new member to an organization
   * @param orgId - Organization ID
   * @param email - Invitee's email
   * @param role - Role to assign
   * @param inviterUser - User sending the invite
   * @returns The invite token
   * @throws ApiError if user lacks permission
   */
  public static async inviteMember(
    orgId: string | Types.ObjectId,
    email: string,
    role: OrgMember['role'] = 'member',
    inviterUser: UserDocument
  ): Promise<string> {
    // Check if inviter has admin rights
    const hasPermission = await this.isOrgAdmin(inviterUser, orgId);
    if (!hasPermission) {
      throw new ApiError(403, 'Insufficient permissions to invite members');
    }

    // Check if user is already a member
    const org = await this.getOrgById(orgId);
    if (!org) {
      throw new ApiError(404, 'Organization not found');
    }

    const existingMember = org.members.find(member =>
      member.user && (member.user as any).email === email
    );

    if (existingMember) {
      throw new ApiError(400, 'User is already a member of this organization');
    }

    // This would typically use a dedicated InviteService to generate a token
    // For now, return a placeholder - this should be implemented properly
    // Refer to section 6 in the documentation for full implementation
    return `invite-token-for-${email}-to-${orgId}-as-${role}`;
  }

  /**
   * Adds a user to an organization based on invite token
   * @param token - Invite token
   * @param user - User accepting the invite
   * @returns The updated organization
   */
  public static async acceptInvite(token: string, user: UserDocument): Promise<OrganizationDocument> {
    // In a full implementation, this would validate the token and extract orgId and role
    // For this implementation, we'll parse our placeholder token format

    const tokenParts = token.split('-');
    if (!tokenParts || tokenParts[0] !== 'invite') {
      throw new ApiError(400, 'Invalid invite token');
    }

    const email = tokenParts[2];
    const orgId = tokenParts[4];
    const role = tokenParts[6] as OrgMember['role'];

    if (email !== user.email) {
      throw new ApiError(403, 'Invite token was issued for a different email address');
    }

    // Add user to organization
    const org = await Organization.findById(orgId);
    if (!org) {
      throw new ApiError(404, 'Organization not found');
    }

    // Check if already a member
    const isMember = org.members.some(m => m.user.toString() === user._id.toString());
    if (isMember) {
      throw new ApiError(400, 'User is already a member of this organization');
    }

    // Add member
    org.members.push({
      user: user._id,
      role,
      joinedAt: new Date()
    });

    await org.save();

    // Add org to user's organizations
    await User.updateOne(
      { _id: user._id },
      { $addToSet: { organizations: org._id } }
    );

    return org;
  }

  /**
   * Removes a member from an organization
   * @param orgId - Organization ID
   * @param memberId - ID of the user to remove
   * @param actorUser - User performing the removal
   * @returns The updated organization
   * @throws ApiError if user lacks permission or is removing the last owner
   */
  public static async removeMember(
    orgId: string | Types.ObjectId,
    memberId: string | Types.ObjectId,
    actorUser: UserDocument
  ): Promise<OrganizationDocument> {
    // Verify user has admin rights
    const hasPermission = await this.isOrgAdmin(actorUser, orgId);
    if (!hasPermission) {
      throw new ApiError(403, 'Insufficient permissions to remove members');
    }

    const org = await this.getOrgById(orgId);
    if (!org) {
      throw new ApiError(404, 'Organization not found');
    }

    // Check if removing last owner
    const targetMemberIdx = org.members.findIndex(m => m.user._id.toString() === memberId.toString());
    if (targetMemberIdx === -1) {
      throw new ApiError(404, 'Member not found in organization');
    }

    const targetMember = org.members[targetMemberIdx];

    if (targetMember.role === 'owner') {
      // Count owners
      const ownerCount = org.members.filter(m => m.role === 'owner').length;
      if (ownerCount <= 1) {
        throw new ApiError(400, 'Cannot remove the last owner of an organization');
      }
    }

    // Remove member
    org.members.splice(targetMemberIdx, 1);
    await org.save();

    // Remove org from user's organizations list
    await User.updateOne(
      { _id: memberId },
      { $pull: { organizations: org._id } }
    );

    // If this was the user's default org, update it
    const user = await User.findById(memberId);
    if (user && user.defaultOrg?.toString() === org._id.toString()) {
      // Set a different org as default if available
      if (user.organizations && user.organizations.length > 0) {
        user.defaultOrg = user.organizations[0];
      } else {
        user.defaultOrg = undefined;
      }
      await user.save();
    }

    return org;
  }

  /**
   * Changes a member's role in an organization
   * @param orgId - Organization ID
   * @param memberId - ID of the user to update
   * @param newRole - New role to assign
   * @param actorUser - User performing the role change
   * @returns The updated organization
   * @throws ApiError if user lacks permission or is trying to demote the last owner
   */
  public static async changeRole(
    orgId: string | Types.ObjectId,
    memberId: string | Types.ObjectId,
    newRole: OrgMember['role'],
    actorUser: UserDocument
  ): Promise<OrganizationDocument> {
    // Verify user has admin rights
    const hasPermission = await this.isOrgAdmin(actorUser, orgId);
    if (!hasPermission) {
      throw new ApiError(403, 'Insufficient permissions to change member roles');
    }

    const org = await this.getOrgById(orgId);
    if (!org) {
      throw new ApiError(404, 'Organization not found');
    }

    // Find target member
    const targetMemberIdx = org.members.findIndex(m =>
      m.user._id.toString() === memberId.toString()
    );

    if (targetMemberIdx === -1) {
      throw new ApiError(404, 'Member not found in organization');
    }

    const currentRole = org.members[targetMemberIdx].role;

    // If demoting from owner, check if it's the last owner
    if (currentRole === 'owner' && newRole !== 'owner') {
      const ownerCount = org.members.filter(m => m.role === 'owner').length;
      if (ownerCount <= 1) {
        throw new ApiError(400, 'Cannot demote the last owner of an organization');
      }
    }

    // Update role
    org.members[targetMemberIdx].role = newRole;
    await org.save();

    return org;
  }

  /**
   * Checks if a user is a member of an organization
   * @param user - User to check
   * @param orgId - Organization ID
   * @returns Whether the user is a member
   */
  public static async isOrgMember(
    user: UserDocument,
    orgId: string | Types.ObjectId
  ): Promise<boolean> {
    const org = await Organization.findOne({
      _id: orgId,
      'members.user': user._id
    });

    return !!org;
  }

  /**
   * Checks if a user is an admin or owner of an organization
   * @param user - User to check
   * @param orgId - Organization ID
   * @returns Whether the user is an admin or owner
   */
  public static async isOrgAdmin(
    user: UserDocument,
    orgId: string | Types.ObjectId
  ): Promise<boolean> {
    const org = await Organization.findOne({
      _id: orgId,
      'members.user': user._id,
      'members': {
        $elemMatch: {
          user: user._id,
          role: { $in: ['admin', 'owner'] }
        }
      }
    });

    return !!org;
  }
}