FROM mcr.microsoft.com/dotnet/runtime:6.0 AS base
WORKDIR /app

FROM mcr.microsoft.com/dotnet/sdk:6.0 AS build
WORKDIR /src
COPY ["BetterServiceBase/BetterServiceBase.csproj", "BetterServiceBase/"]
RUN dotnet restore "BetterServiceBase/BetterServiceBase.csproj"
COPY . .
WORKDIR "/src/BetterServiceBase"
RUN dotnet build "BetterServiceBase.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "BetterServiceBase.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "BetterServiceBase.dll"]
