import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Building2, Users, UserCog, MapPin, Mail, Phone } from "lucide-react";
import { Link } from "wouter";

type OrganizationProfile = {
  id: string;
  name: string;
  description?: string;
  location?: string;
  coaches: Array<{
    id: string;
    role: string;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
  }>;
  players: Array<{
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    birthYear: number;
    school?: string;
    sports: string[];
    emails: string[];
    phoneNumbers: string[];
    teams: Array<{
      id: string;
      name: string;
      level?: string;
      organization: {
        id: string;
        name: string;
      };
    }>;
  }>;
};

export default function OrganizationProfile() {
  const { id } = useParams<{ id: string }>();

  const { data: organization, isLoading, error } = useQuery<OrganizationProfile>({
    queryKey: [`/api/organizations/${id}/profile`],
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading organization profile...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-red-600">Failed to load organization profile</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-gray-900">{organization.name}</h1>
          </div>
          {organization.location && (
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin className="h-4 w-4" />
              <span>{organization.location}</span>
            </div>
          )}
          {organization.description && (
            <p className="text-gray-600 mt-2">{organization.description}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coaches Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              Coaches & Administrators ({organization.coaches.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {organization.coaches.length === 0 ? (
                <p className="text-gray-500 text-sm">No coaches assigned</p>
              ) : (
                organization.coaches.map((coach) => (
                  <div key={coach.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {coach.user.firstName} {coach.user.lastName}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Mail className="h-3 w-3" />
                        <span>{coach.user.email}</span>
                      </div>
                    </div>
                    <Badge variant={coach.role === 'org_admin' ? 'default' : 'secondary'}>
                      {coach.role === 'org_admin' ? 'Admin' : 'Coach'}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Players Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Athletes ({organization.players.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {organization.players.length === 0 ? (
                <p className="text-gray-500 text-sm">No athletes assigned</p>
              ) : (
                organization.players.map((player) => (
                  <div key={player.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <Link href={`/athletes/${player.id}`} className="hover:text-primary">
                          <p className="font-medium text-gray-900 hover:underline">
                            {player.fullName}
                          </p>
                        </Link>
                        {player.school && (
                          <p className="text-sm text-gray-600">{player.school}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Born {player.birthYear}</p>
                        {player.sports.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {player.sports.slice(0, 2).map((sport, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {sport}
                              </Badge>
                            ))}
                            {player.sports.length > 2 && (
                              <span className="text-xs text-gray-500">+{player.sports.length - 2}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Contact Info */}
                    {(player.emails.length > 0 || player.phoneNumbers.length > 0) && (
                      <div className="text-xs text-gray-600 space-y-1">
                        {player.emails.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            <span>{player.emails[0]}</span>
                          </div>
                        )}
                        {player.phoneNumbers.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            <span>{player.phoneNumbers[0]}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Teams */}
                    {player.teams.length > 0 && (
                      <>
                        <Separator className="my-2" />
                        <div className="text-xs text-gray-600">
                          <span className="font-medium">Teams: </span>
                          {player.teams.map((team, index) => (
                            <span key={team.id}>
                              {team.name}
                              {team.level && ` (${team.level})`}
                              {index < player.teams.length - 1 && ', '}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}