FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY BSB.sln .
COPY BSB/BSB.csproj BSB/
COPY BetterServiceBase/BetterServiceBase.csproj BetterServiceBase/
COPY plugins/config-default/config-default.csproj plugins/config-default/
COPY plugins/observable-default/observable-default.csproj plugins/observable-default/
COPY plugins/events-default/events-default.csproj plugins/events-default/
RUN dotnet restore BSB.sln

COPY . .
RUN dotnet publish BetterServiceBase/BetterServiceBase.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/runtime:10.0
WORKDIR /app
RUN useradd --no-create-home --uid 1654 bsb
COPY --from=build /app/publish .
USER bsb

ENV BSB_MODE=production
ENV BSB_CONTAINER=true

ENTRYPOINT ["dotnet", "BetterServiceBase.dll"]
