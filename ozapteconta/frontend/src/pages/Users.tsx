import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users as UsersIcon, Phone, ArrowDownCircle, Mic, ChevronLeft, ChevronRight } from "lucide-react";
import api, { WhatsappUser } from "@/lib/api";
import { Card, CardContent, Badge, Button, Skeleton } from "@/components/ui";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Users() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-users", page],
    queryFn: () =>
      api.get("/settings/whatsapp-users", { params: { page } })
        .then((r) => r.data as { users: WhatsappUser[]; total: number }),
  });

  const pages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Usuários WhatsApp</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {data?.total ?? 0} usuários cadastrados
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}><CardContent className="p-5"><Skeleton className="h-20 w-full" /></CardContent></Card>
            ))
          : data?.users.map((user) => (
              <Card key={user.id} className="hover:border-primary/30 transition-all duration-200">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">
                        {(user.name || user.phone)[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {user.name || "Sem nome"}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />
                        {user.displayPhone || user.resolvedPhone || user.phone}
                      </p>
                    </div>
                    <Badge variant={user.isActive ? "success" : "secondary"}>
                      {user.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="p-2.5 rounded-lg bg-secondary/50 text-center">
                      <p className="text-lg font-bold text-foreground">
                        {user._count?.transactions ?? user.totalTransactions}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <ArrowDownCircle className="w-3 h-3" />
                        Transações
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-secondary/50 text-center">
                      <p className="text-lg font-bold text-foreground">
                        {user._count?.audioMessages ?? 0}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <Mic className="w-3 h-3" />
                        Áudios
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mt-3">
                    Desde {format(new Date(user.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </CardContent>
              </Card>
            ))}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Página {page} de {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
